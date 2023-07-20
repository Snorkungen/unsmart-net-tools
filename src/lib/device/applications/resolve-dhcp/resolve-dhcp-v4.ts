import { Buffer } from "buffer";
import { Device } from "../../device";
import { Interface } from "../../interface";
import { DHCP_HEADER, DCHP_OP, DHCP_MAGIC_COOKIE, DHCP_END_OPTION, DHCP_OPTION, DCHP_PORT_CLIENT, DCHP_PORT_SERVER } from "../../../header/dhcp/dhcp";
import { DHCPTag, DHCP_MESSGAGE_TYPES, DHCP_TAGS } from "../../../header/dhcp/tags";
import { bufferFromNumber } from "../../../binary/buffer-from-number";
import { UDP_HEADER } from "../../../header/udp";
import { IPV4Address } from "../../../address/ipv4";
import { IPV4_PSEUDO_HEADER, PROTOCOLS, createIPV4Header } from "../../../header/ip";
import { calculateChecksum } from "../../../binary/checksum";
import { ETHERNET_HEADER, ETHER_TYPES } from "../../../header/ethernet";
import { UNSET_MAC_ADDRESS } from "../../contact/contacts-handler";
import { BROADCAST_MAC_ADDRESS } from "../../neighbor-table";
import { ContactAddrFamily, ContactProto } from "../../contact/contact";

function createOptionBuffer(tag: DHCPTag, data: Buffer): Buffer {
    return DHCP_OPTION.create({
        tag: tag,
        len: data.length,
        data: data
    }).getBuffer();
}

export function resolveDHCPv4(device: Device, iface: Interface) {
    // send first DHCP_DISCOVER
    let transactionID = Math.floor(Math.random() * (2 ** 14))
    let dhcpDiscoverHdr = DHCP_HEADER.create({
        op: DCHP_OP.BOOTREQUEST,
        htype: 1,
        hlen: 6,
        xid: transactionID,
        chaddr: Buffer.concat([
            iface.macAddress.buffer,
            Buffer.alloc(10) // padding
        ]), // total 16 bytes
        options: Buffer.concat([
            DHCP_MAGIC_COOKIE,
            createOptionBuffer(DHCP_TAGS.DHCP_MESSAGE_TYPE, bufferFromNumber(DHCP_MESSGAGE_TYPES.DHCPDISCOVER, 1)), // DHCP MESSAGE TYPE
            createOptionBuffer(DHCP_TAGS.CLIENT_IDENTIFIER, Buffer.concat([bufferFromNumber(0x01, 1), iface.macAddress.buffer])), // DHCP CLIENT IDENTIFIER
            createOptionBuffer(DHCP_TAGS.PARAMETER_REQUEST_LIST, Buffer.from([ // DHCP PARAMETER REQUEST LIST
                DHCP_TAGS.SUBNET_MASK,
                DHCP_TAGS.ROUTER,
                DHCP_TAGS.DOMAIN_NAME_SERVER
            ])),
            createOptionBuffer(DHCP_TAGS.IP_ADDRESS_LEASE_TIME, bufferFromNumber( // DHCP IP ADDRESS LEASE TIME
                30, // 30 secs
                4
            )),
            DHCP_END_OPTION
        ])
    })

    let udpHdr = UDP_HEADER.create({
        sport: DCHP_PORT_CLIENT,
        dport: DCHP_PORT_SERVER,
        length: UDP_HEADER.getMinSize() + dhcpDiscoverHdr.size,
        payload: dhcpDiscoverHdr.getBuffer(),
    });

    let saddr = dhcpDiscoverHdr.get("ciaddr"), daddr = new IPV4Address("255.255.255.255"), proto = PROTOCOLS.UDP;

    let pseudoHdr = IPV4_PSEUDO_HEADER.create({
        saddr, daddr, proto, len: udpHdr.get("length"),
    });

    udpHdr.set("csum", calculateChecksum(pseudoHdr.getBuffer()));

    let ipHdr = createIPV4Header({
        saddr, daddr, proto, payload: udpHdr.getBuffer()
    })

    let ethHdr = ETHERNET_HEADER.create({
        smac: UNSET_MAC_ADDRESS,
        dmac: BROADCAST_MAC_ADDRESS,
        ethertype: ETHER_TYPES.IPv4,
        payload: ipHdr.getBuffer()
    });


    // This is where i get into problems this needs to be stateful so i would need to do some weird ugly callback programming.
    // Even then i would have issues due to the fact that i would have a need to keep timers and intervals and stuff

    let contact = device.contactsHandler.createContact(ContactAddrFamily.RAW, ContactProto.RAW);

    contact.send(ethHdr.getBuffer());
    contact.close();
}