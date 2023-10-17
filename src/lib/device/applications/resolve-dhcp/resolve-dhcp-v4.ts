import { Buffer } from "buffer";
import { Device } from "../../device";
import { Interface } from "../../interface";
import { DHCP_HEADER, DCHP_OP, DHCP_MAGIC_COOKIE, DHCP_END_OPTION, DHCP_OPTION, DCHP_PORT_CLIENT, DCHP_PORT_SERVER } from "../../../header/dhcp/dhcp";
import { DHCPTag, DHCP_MESSGAGE_TYPES, DHCP_TAGS } from "../../../header/dhcp/tags";
import { UDP_HEADER } from "../../../header/udp";
import { IPV4Address } from "../../../address/ipv4";
import { IPV4_HEADER, IPV4_PSEUDO_HEADER, PROTOCOLS, createIPV4Header } from "../../../header/ip";
import { calculateChecksum } from "../../../binary/checksum";
import { ETHERNET_HEADER, ETHER_TYPES } from "../../../header/ethernet";
import { UNSET_IPV4_ADDRESS, UNSET_MAC_ADDRESS } from "../../contact/contacts-handler";
import { BROADCAST_MAC_ADDRESS } from "../../neighbor-table";
import { Contact, ContactAddrFamily, ContactProto } from "../../contact/contact";
import { parseDHCPOptions } from "../../../header/dhcp/parse-options";
import { createDHCPOptionsMap } from "../../../header/dhcp/utils";
import { AddressMask, createMask } from "../../../address/mask";
import { uint8_concat, uint8_fromNumber } from "../../../binary/uint8-array";

function createOptionBuffer(tag: DHCPTag, data: Uint8Array): Uint8Array {
    return DHCP_OPTION.create({
        tag: tag,
        len: data.length,
        data: data
    }).getBuffer();
}

enum DHCPClientState {
    DISCOVER,
    REQUEST,

    BOUND
}

type DHCPClientParameters = {
    state: DHCPClientState;

    // theese are the only params that i care about for now
    ipv4Address?: IPV4Address;
    ipv4SubnetMask?: AddressMask<typeof IPV4Address>;
    leaseTime?: number;
    serverID?: Uint8Array;
}

export function resolveDHCPv4(device: Device, iface: Interface) {
    // send first DHCP_DISCOVER
    let transactionID = Math.floor(Math.random() * (2 ** 14)),
        parameterRequestList = createOptionBuffer(DHCP_TAGS.PARAMETER_REQUEST_LIST, Buffer.from([ // DHCP PARAMETER REQUEST LIST
            DHCP_TAGS.SUBNET_MASK,
            // DHCP_TAGS.ROUTER,
            // DHCP_TAGS.DOMAIN_NAME_SERVER
        ]))
    let dhcpDiscoverHdr = DHCP_HEADER.create({
        op: DCHP_OP.BOOTREQUEST,
        htype: 1,
        hlen: 6,
        xid: transactionID,
        chaddr: Buffer.concat([
            iface.macAddress.buffer,
            new Uint8Array(10) // padding
        ]), // total 16 bytes
        options: Buffer.concat([
            DHCP_MAGIC_COOKIE,
            createOptionBuffer(DHCP_TAGS.DHCP_MESSAGE_TYPE, uint8_fromNumber(DHCP_MESSGAGE_TYPES.DHCPDISCOVER, 1)), // DHCP MESSAGE TYPE
            createOptionBuffer(DHCP_TAGS.CLIENT_IDENTIFIER, uint8_concat([uint8_fromNumber(0x01, 1), iface.macAddress.buffer])), // DHCP CLIENT IDENTIFIER
            parameterRequestList,
            DHCP_END_OPTION
        ])
    })

    // This is where i get into problems this needs to be stateful so i would need to do some weird ugly callback programming.
    // Even then i would have issues due to the fact that i would have a need to keep timers and intervals and stuff

    let contact = device.contactsHandler.createContact(ContactAddrFamily.RAW, ContactProto.RAW);
    let params: DHCPClientParameters = {
        state: DHCPClientState.DISCOVER
    };

    const tearDownFn = () => {
        contact.close();
    }

    contact.recieve = (buf, riface) => {
        if (iface != riface) {
            return;
        }

        let ethHdr = ETHERNET_HEADER.from(buf);
        if (ethHdr.get("ethertype") != ETHER_TYPES.IPv4) {
            return;
        }

        let ipHdr = IPV4_HEADER.from(ethHdr.get("payload"));

        let rDaddr = ipHdr.get("daddr").toString();
        if (rDaddr != BROADCAST_IPV4_ADDRESS.toString() && rDaddr != iface.ipv4Address?.toString()) {
            return;
        }

        if (ipHdr.get("proto") != PROTOCOLS.UDP) {
            return;
        }

        let udpHdr = UDP_HEADER.from(ipHdr.get("payload"));

        if (udpHdr.get("sport") != DCHP_PORT_SERVER || udpHdr.get("dport") != DCHP_PORT_CLIENT) {
            return;
        }

        let dhcpHdr = DHCP_HEADER.from(udpHdr.get("payload"));

        if (dhcpHdr.get("op") != DCHP_OP.BOOTREPLY || dhcpHdr.get("xid") != transactionID) {
            return;
        }

        let parsedOpts = parseDHCPOptions(dhcpHdr.get("options")),
            opts = createDHCPOptionsMap(parsedOpts);

        let messageType = opts.get(DHCP_TAGS.DHCP_MESSAGE_TYPE)?.at(0)
        if (params.state == DHCPClientState.DISCOVER && messageType == DHCP_MESSGAGE_TYPES.DHCPOFFER) {
            if (dhcpHdr.get("yiaddr").toString() == UNSET_IPV4_ADDRESS.toString()) {
                return;
            }

            if (!opts.get(DHCP_TAGS.SERVER_IDENTIFIER)) {
                return;
            }

            if (!opts.get(DHCP_TAGS.SUBNET_MASK)) {
                return;
            }

            params.ipv4Address = dhcpHdr.get("yiaddr");
            params.ipv4SubnetMask = createMask(IPV4Address, opts.get(DHCP_TAGS.SUBNET_MASK)!.subarray(0, 4));
            params.serverID = opts.get(DHCP_TAGS.SERVER_IDENTIFIER);

            // handle offer
            let replyDHCPHdrOptions: Uint8Array[] = [
                DHCP_MAGIC_COOKIE,
                createOptionBuffer(DHCP_TAGS.DHCP_MESSAGE_TYPE, uint8_fromNumber(DHCP_MESSGAGE_TYPES.DHCPREQUEST, 1)), // DHCP MESSAGE TYPE
                createOptionBuffer(DHCP_TAGS.CLIENT_IDENTIFIER, uint8_concat([uint8_fromNumber(0x01, 1), iface.macAddress.buffer])), // DHCP CLIENT IDENTIFIER
                parameterRequestList,
                createOptionBuffer(DHCP_TAGS.SERVER_IDENTIFIER, opts.get(DHCP_TAGS.SERVER_IDENTIFIER)!)
            ];

            // I haven't bothered to read the full spec so i'm just guessing as to what i am supposed to do

            let leaseTimeBufOpt = opts.get(DHCP_TAGS.IP_ADDRESS_LEASE_TIME);
            if (leaseTimeBufOpt) {
                let leaseTimeBuf = Buffer.from(leaseTimeBufOpt)
                params.leaseTime = (leaseTimeBuf).readUint32BE();
                replyDHCPHdrOptions.push(createOptionBuffer(DHCP_TAGS.IP_ADDRESS_LEASE_TIME, leaseTimeBuf))
            }

            let subnetBuf = opts.get(DHCP_TAGS.SUBNET_MASK);
            if (subnetBuf) {
                replyDHCPHdrOptions.push(createOptionBuffer(DHCP_TAGS.SUBNET_MASK, Buffer.from(subnetBuf)));
            }

            replyDHCPHdrOptions.push(createOptionBuffer(
                DHCP_TAGS.REQUESTED_IP_ADDRESS,
                Buffer.from(dhcpHdr.get("yiaddr").buffer)
            ))


            // LAST OPTION 
            replyDHCPHdrOptions.push(DHCP_END_OPTION)

            let replyDHCPHdr = DHCP_HEADER.create({
                op: DCHP_OP.BOOTREQUEST,
                htype: 1,
                hlen: 6,
                xid: transactionID,
                chaddr: Buffer.concat([
                    iface.macAddress.buffer,
                    Buffer.alloc(10) // padding
                ]), // total 16 bytes
                options: Buffer.concat(replyDHCPHdrOptions)
            })

            params.state = DHCPClientState.REQUEST;
            sendDHCPv4Hdr(contact, replyDHCPHdr, iface)
        } else if (params.state == DHCPClientState.REQUEST) {
            if (messageType == DHCP_MESSGAGE_TYPES.DHCPNAK) {
                // setTimeout recurse
                return;
            } else if (messageType == DHCP_MESSGAGE_TYPES.DHCPACK) {
                // commit configuration
                console.info("COMMITTING DHCP")
                iface.ipv4Address = params.ipv4Address;
                iface.ipv4SubnetMask = params.ipv4SubnetMask;

                // set timeout to revalidate with lease time
                params.state = DHCPClientState.BOUND;
            }

        }
    }

    // send discover
    sendDHCPv4Hdr(contact, dhcpDiscoverHdr, iface);
    params.state = DHCPClientState.DISCOVER;
}

const BROADCAST_IPV4_ADDRESS = new IPV4Address("255.255.255.255");
function sendDHCPv4Hdr(contact: Contact<ContactAddrFamily.RAW, ContactProto.RAW>, dhcpHdr: typeof DHCP_HEADER, iface: Interface, daddr: IPV4Address = BROADCAST_IPV4_ADDRESS, saddr: IPV4Address = UNSET_IPV4_ADDRESS) {
    let udpHdr = UDP_HEADER.create({
        sport: DCHP_PORT_CLIENT,
        dport: DCHP_PORT_SERVER,
        length: UDP_HEADER.getMinSize() + dhcpHdr.size,
        payload: dhcpHdr.getBuffer(),
    });

    let proto = PROTOCOLS.UDP;

    let pseudoHdr = IPV4_PSEUDO_HEADER.create({
        saddr, daddr, proto, len: udpHdr.get("length"),
    });

    udpHdr.set("csum", calculateChecksum(pseudoHdr.getBuffer()));

    let ipHdr = createIPV4Header({
        saddr,
        daddr,
        proto,
        payload: udpHdr.getBuffer()
    })

    let dmac = BROADCAST_MAC_ADDRESS;

    if (daddr.toString() != BROADCAST_IPV4_ADDRESS.toString()) {
        // do arp stuff and get mac address
        // for now throw error
        throw new Error("Cannot send to " + daddr.toString() + " ARP logic not implemented");
        // Here i would also need to ensure that the interface has an IP Address configured
    }

    let ethHdr = ETHERNET_HEADER.create({
        smac: iface.macAddress,
        dmac: dmac,
        ethertype: ETHER_TYPES.IPv4,
        payload: ipHdr.getBuffer()
    });

    contact.send(ethHdr.getBuffer());
}