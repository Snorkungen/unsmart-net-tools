import { IPV4Address } from "../../address/ipv4";
import { IPV6Address } from "../../address/ipv6";
import { calculateChecksum } from "../../binary/checksum";
import { ETHERNET_HEADER, ETHER_TYPES } from "../../header/ethernet";
import { ICMPV6_TYPES, ICMP_ECHO_HEADER, ICMP_HEADER, ICMPV4_TYPES } from "../../header/icmp";
import { IPV4_HEADER, IPV6_HEADER, IPV6_PSEUDO_HEADER, PROTOCOLS, createIPV4Header } from "../../header/ip";
import { Host } from "../host";
import { resolveSendingInformationVersion4, resolveSendingInformationVersion6 } from "../host/resolve-sending-information";
import { uint8_concat } from "../../binary/uint8-array";


/*

    IMPORTANT PLEASE READ

    I need to revisit the implementation because this should respond in different ways
*/


export async function pingVersion4(host: Host, destination: IPV4Address, identifier = Math.floor(Math.random() * 1_000), sequence = 0) {
    let echoHdr = ICMP_ECHO_HEADER.create({
        id: identifier,
        seq: sequence
    }), icmpHdr = ICMP_HEADER.create({
        type: ICMPV4_TYPES.ECHO_REQUEST,
        data: echoHdr.getBuffer()
    });

    let entry = await resolveSendingInformationVersion4(host, destination);
    if (!entry.iface.isConnected || !entry.iface.ipv4Address) {
        // failed because interface does not have ipv4 configured
        // return;
        // Do nothing because i haven't decided if the device should have an async send function. So thats why this allows me to have an device ping it self
    }

    icmpHdr.set("csum", calculateChecksum(icmpHdr.getBuffer()));

    let ipHdr = createIPV4Header({
        saddr: entry.iface.ipv4Address!,
        daddr: destination,
        proto: PROTOCOLS.ICMP,
        payload: icmpHdr.getBuffer()
    })
    let frame = ETHERNET_HEADER.create({
        smac: entry.iface.macAddress,
        dmac: entry.macAddress,
        ethertype: ETHER_TYPES.IPv4,
        payload: ipHdr.getBuffer()
    })

    // console.log("%c ECHO Reply recieved: " + host.name, ['background: green', 'color: white', 'display: block', 'text-align: center', 'font-size: 24px'].join(';'))
    return new Promise<typeof ETHERNET_HEADER>(resolve => host.statefulSend(frame, resolve))
}

export async function pingVersion6(host: Host, destination: IPV6Address, identifier = Math.floor(Math.random() * 1_000), sequence = 0) {
    let echoHdr = ICMP_ECHO_HEADER.create({
        id: identifier,
        seq: sequence
    }), icmpHdr = ICMP_HEADER.create({
        type: ICMPV6_TYPES.ECHO_REQUEST,
        data: echoHdr.getBuffer()
    });

    let entry = await resolveSendingInformationVersion6(host, destination)
    if (!entry.iface.isConnected || !entry.iface.ipv6Address) {
        // refer to commments in version 4
    }

    // The actual spec <https://www.rfc-editor.org/rfc/rfc4443#section-2.3>
    let pseudoHdr = IPV6_PSEUDO_HEADER.create({
        saddr: entry.iface.ipv6Address!,
        daddr: destination,
        len: icmpHdr.size,
        nextHeader: PROTOCOLS.IPV6_ICMP,
    })

    icmpHdr.set("csum", calculateChecksum(uint8_concat([pseudoHdr.getBuffer(), icmpHdr.getBuffer()])));

    let ipHdr = IPV6_HEADER.create({
        saddr: entry.iface.ipv6Address!,
        daddr: destination,
        nextHeader: PROTOCOLS.IPV6_ICMP,
        payload: icmpHdr.getBuffer()
    })

    let frame = ETHERNET_HEADER.create({
        smac: entry.iface.macAddress,
        dmac: entry.macAddress,
        ethertype: ETHER_TYPES.IPv6,
        payload: ipHdr.getBuffer()
    })


    return new Promise<typeof ETHERNET_HEADER>(resolve => host.statefulSend(frame, resolve))
}

export default async function ping(host: Host, destination: IPV4Address | IPV6Address, identifier = Math.floor(Math.random() * 1_000), sequence = 0) {

    if (destination instanceof IPV4Address) {
        return await pingVersion4(host, destination);
    } else {
        return await pingVersion6(host, destination)
    }

}