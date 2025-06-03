import { BaseAddress } from "../../address/base";
import { IPV4Address } from "../../address/ipv4";
import { MACAddress } from "../../address/mac";
import { AddressMask, createMask } from "../../address/mask";
import { calculateChecksum } from "../../binary/checksum";
import { uint8_concat, uint8_equals, uint8_fromNumber, uint8_readUint32BE } from "../../binary/uint8-array";
import { DCHP_OP, DCHP_PORT_CLIENT, DCHP_PORT_SERVER, DHCP_END_OPTION, DHCP_HEADER, DHCP_MAGIC_COOKIE, DHCP_OPTION } from "../../header/dhcp/dhcp";
import { parseDHCPOptions } from "../../header/dhcp/parse-options";
import { DHCPTag, DHCP_MESSGAGE_TYPES, DHCP_TAGS } from "../../header/dhcp/tags";
import { createDHCPOptionsMap } from "../../header/dhcp/utils";
import { ETHERNET_HEADER, ETHER_TYPES } from "../../header/ethernet";
import { IPV4_HEADER, IPV4_PSEUDO_HEADER, PROTOCOLS, createIPV4Header } from "../../header/ip";
import { UDP_HEADER } from "../../header/udp";
import { NetworkData } from "../device";
import { Contact, Process, ProcessSignal, Program } from "../device";
import { EthernetInterface } from "../interface";

enum DHCPClientState {
    DISCOVER,
    REQUEST,

    BOUND
}

type DHCPClientData = {
    /** transaction id */
    xid: number;
    state: DHCPClientState;
    contact: Contact;
    iface: EthernetInterface;

    parameterReqList: Uint8Array;

    leaseTime?: number;
    /** server id */
    sid?: Uint8Array;

    /** only support ipv4 for now */
    address4?: IPV4Address;
    netmask4?: AddressMask<typeof IPV4Address>;
    gateways4?: IPV4Address[];
}

const UNSET_IPV4_ADDRESS = new IPV4Address("0.0.0.0");
const BROADCAST_IPV4_ADDRESS = new IPV4Address("255.255.255.255");
const BROADCAST_MAC_ADDRESS = new MACAddress("ff:ff:ff:ff:ff:ff");

function createOptionBuffer(tag: DHCPTag, data: Uint8Array): Uint8Array {
    return DHCP_OPTION.create({
        tag: tag,
        len: data.length,
        data: data
    }).getBuffer();
}

function sendDHCPv4Hdr(proc: Process<DHCPClientData>, dhcpHdr: typeof DHCP_HEADER, daddr: IPV4Address = BROADCAST_IPV4_ADDRESS, saddr: IPV4Address = UNSET_IPV4_ADDRESS) {
    let udphdr = UDP_HEADER.create({
        sport: DCHP_PORT_CLIENT,
        dport: DCHP_PORT_SERVER,
        payload: dhcpHdr.getBuffer(),
    });
    udphdr.set("length", udphdr.size)

    let pseudohdr = IPV4_PSEUDO_HEADER.create({
        saddr, daddr, proto: PROTOCOLS.UDP, len: udphdr.get("length"),
    });

    udphdr.set("csum", calculateChecksum(uint8_concat([pseudohdr.getBuffer(), udphdr.getBuffer()])));

    let iphdr = IPV4_HEADER.create({
        version: 4,
        ihl: IPV4_HEADER.getMinSize() >> 2,
        tos: 0,
        ttl: 1,
        len: IPV4_HEADER.size + udphdr.size,
        payload: udphdr.getBuffer(),
        csum: 0,
        proto: PROTOCOLS.UDP,
        saddr,
        daddr
    })

    iphdr.set("csum", 0);
    iphdr.set("csum", calculateChecksum(iphdr.getBuffer().slice(0, iphdr.get("ihl") << 2)));

    let dmac = BROADCAST_MAC_ADDRESS;
    let etherhdr = ETHERNET_HEADER.create({
        smac: proc.data.iface.macAddress,
        dmac: dmac,
        ethertype: ETHER_TYPES.IPv4,
    });
    proc.data.contact.send({
        buffer: iphdr.getBuffer(),
        broadcast: true,
    }, new BaseAddress(etherhdr.getBuffer()), {
        destination: iphdr.get("daddr"),
        gateway: UNSET_IPV4_ADDRESS,
        netmask: createMask(IPV4Address, UNSET_IPV4_ADDRESS.buffer),
        iface: proc.data.iface
    });
}

function receive(proc: Process<DHCPClientData>) {
    return function (_: Contact, data: NetworkData) {
        if (data.rcvif != proc.data.iface) {
            return;
        }

        let etherhdr = ETHERNET_HEADER.from(data.buffer);
        if (etherhdr.get("ethertype") != ETHER_TYPES.IPv4) {
            // only support DHCP(4)
            return;
        }

        let iphdr = IPV4_HEADER.from(etherhdr.get("payload"));
        if (calculateChecksum(iphdr.getBuffer().slice(0, iphdr.get("ihl") << 2)) != 0) {
            return;
        }

        // copied from previous implementation
        if (!uint8_equals(iphdr.get("daddr").buffer, BROADCAST_IPV4_ADDRESS.buffer) &&
            !proc.data.iface.addresses.find(a => uint8_equals(a.address.buffer, iphdr.get("daddr").buffer))) {
            return;
        }

        if (iphdr.get("proto") != PROTOCOLS.UDP) {
            return;
        }

        let udphdr = UDP_HEADER.from(iphdr.get("payload"));
        // !TODO: validate checksum
        if (udphdr.get("sport") != DCHP_PORT_SERVER || udphdr.get("dport") != DCHP_PORT_CLIENT) {
            return;
        }

        let dhcphdr = DHCP_HEADER.from(udphdr.get("payload"));
        if (dhcphdr.get("op") != DCHP_OP.BOOTREPLY || dhcphdr.get("xid") != proc.data.xid) {
            return;
        }

        let parsedOpts = parseDHCPOptions(dhcphdr.get("options")),
            opts = createDHCPOptionsMap(parsedOpts);

        let messageType = opts.get(DHCP_TAGS.DHCP_MESSAGE_TYPE)?.at(0)
        if (proc.data.state == DHCPClientState.DISCOVER && messageType == DHCP_MESSGAGE_TYPES.DHCPOFFER) {
            if (uint8_readUint32BE(dhcphdr.get("yiaddr").buffer) === 0) {
                return;
            }

            if (!opts.get(DHCP_TAGS.SERVER_IDENTIFIER)) {
                return;
            }
            if (!opts.get(DHCP_TAGS.SUBNET_MASK)) {
                return;
            }

            proc.data.address4 = dhcphdr.get("yiaddr");
            proc.data.netmask4 = createMask(IPV4Address, opts.get(DHCP_TAGS.SUBNET_MASK)!.subarray(0, 4));
            proc.data.sid = opts.get(DHCP_TAGS.SERVER_IDENTIFIER);


            // handle offer
            let replyDHCPHdrOptions: Uint8Array[] = [
                DHCP_MAGIC_COOKIE,
                createOptionBuffer(DHCP_TAGS.DHCP_MESSAGE_TYPE, uint8_fromNumber(DHCP_MESSGAGE_TYPES.DHCPREQUEST, 1)), // DHCP MESSAGE TYPE
                createOptionBuffer(DHCP_TAGS.CLIENT_IDENTIFIER, uint8_concat([uint8_fromNumber(0x01, 1), proc.data.iface.macAddress.buffer])), // DHCP CLIENT IDENTIFIER
                proc.data.parameterReqList,
                createOptionBuffer(DHCP_TAGS.SERVER_IDENTIFIER, opts.get(DHCP_TAGS.SERVER_IDENTIFIER)!)
            ];

            // I haven't bothered to read the full spec so i'm just guessing as to what i am supposed to do

            let leaseTimeBuf = opts.get(DHCP_TAGS.IP_ADDRESS_LEASE_TIME);
            if (leaseTimeBuf) {
                proc.data.leaseTime = uint8_readUint32BE(leaseTimeBuf);
                replyDHCPHdrOptions.push(createOptionBuffer(DHCP_TAGS.IP_ADDRESS_LEASE_TIME, leaseTimeBuf))
            }

            let subnetBuf = opts.get(DHCP_TAGS.SUBNET_MASK);
            if (subnetBuf) {
                replyDHCPHdrOptions.push(createOptionBuffer(DHCP_TAGS.SUBNET_MASK, new Uint8Array(subnetBuf)));
            }

            let routerBuf = opts.get(DHCP_TAGS.ROUTER);
            if (routerBuf) {
                proc.data.gateways4 = [];
                for (let i = 0; i < routerBuf.byteLength; i += 4) {
                    proc.data.gateways4.push(new IPV4Address(routerBuf.subarray(i, i + 4)))
                }
                replyDHCPHdrOptions.push(createOptionBuffer(DHCP_TAGS.ROUTER, new Uint8Array(routerBuf)));
            }

            replyDHCPHdrOptions.push(createOptionBuffer(
                DHCP_TAGS.REQUESTED_IP_ADDRESS,
                new Uint8Array(dhcphdr.get("yiaddr").buffer)
            ))


            // LAST OPTION 
            replyDHCPHdrOptions.push(DHCP_END_OPTION);

            let replyDHCPHdr = DHCP_HEADER.create({
                op: DCHP_OP.BOOTREQUEST,
                htype: 1,
                hlen: 6,
                xid: proc.data.xid,
                chaddr: uint8_concat([
                    proc.data.iface.macAddress.buffer,
                    new Uint8Array(10) // padding
                ]), // total 16 bytes
                options: uint8_concat(replyDHCPHdrOptions)
            });

            proc.data.state = DHCPClientState.REQUEST;
            sendDHCPv4Hdr(proc, replyDHCPHdr)
        } else if (proc.data.state == DHCPClientState.REQUEST) {
            if (messageType == DHCP_MESSGAGE_TYPES.DHCPNAK) {
                // !TODO: request again etc....
                return;
            } else if (messageType == DHCP_MESSGAGE_TYPES.DHCPACK) {
                // commit configuration
                console.info("COMMITTING DHCP " + proc.data.address4);

                if (proc.data.address4 && proc.data.netmask4) {
                    proc.device.interface_address_set(proc.data.iface, proc.data.address4, proc.data.netmask4);
                }

                if (proc.data.gateways4) {
                    for (let gateway of proc.data.gateways4) {
                        proc.device.routes.push({
                            destination: UNSET_IPV4_ADDRESS,
                            netmask: createMask(IPV4Address, 0),
                            gateway: gateway,
                            iface: proc.data.iface,
                            f_gateway: true
                        })
                    }
                }

                proc.data.state = DHCPClientState.BOUND;
                // !TODO: set timeout to revalidate with least time
                // for now just exit
                proc.close(ProcessSignal.INTERRUPT); // interrupt is to call the cleanup "handle" function
            }
        }
    }
}

export const DEVICE_PROGRAM_DHCP_CLIENT: Program<DHCPClientData> = {
    name: "dhcp_client",
    init(proc, [, ifid], data) {
        // second argument is the ifid
        let iface = data?.iface || proc.device.interfaces.find(f => f.id() == ifid);
        if (!iface || !(iface instanceof EthernetInterface)) {
            // no iface found
            return ProcessSignal.ERROR;
        }

        let contact = proc.resources.create(proc.device.contact_create("RAW", "RAW").data!);

        (<DHCPClientData>proc.data) = {
            xid: Math.floor(Math.random() * (2 ** 14)),
            state: DHCPClientState.DISCOVER,
            contact: contact,
            iface: iface,

            // TODO: make this smart enough to take extenal paramReqList
            parameterReqList: createOptionBuffer(DHCP_TAGS.PARAMETER_REQUEST_LIST, new Uint8Array([ // DHCP PARAMETER REQUEST LIST
                DHCP_TAGS.SUBNET_MASK,
                DHCP_TAGS.ROUTER,
                // DHCP_TAGS.DOMAIN_NAME_SERVER
            ]))
        }

        proc.handle(() => {
            contact.close();
        })

        contact.receive(receive(proc));

        let dhcpDiscoverHdr = DHCP_HEADER.create({
            op: DCHP_OP.BOOTREQUEST,
            htype: 1,
            hlen: 6,
            xid: proc.data.xid,
            chaddr: uint8_concat([
                iface.macAddress.buffer,
                new Uint8Array(10) // padding
            ]), // total 16 bytes
            options: uint8_concat([
                DHCP_MAGIC_COOKIE,
                createOptionBuffer(DHCP_TAGS.DHCP_MESSAGE_TYPE, uint8_fromNumber(DHCP_MESSGAGE_TYPES.DHCPDISCOVER, 1)), // DHCP MESSAGE TYPE
                createOptionBuffer(DHCP_TAGS.CLIENT_IDENTIFIER, uint8_concat([uint8_fromNumber(0x01, 1), iface.macAddress.buffer])), // DHCP CLIENT IDENTIFIER
                proc.data.parameterReqList,
                DHCP_END_OPTION
            ])
        })

        // send discover
        sendDHCPv4Hdr(proc, dhcpDiscoverHdr)
        return ProcessSignal.__EXPLICIT__;
    },
};
