import { EthernetFrame } from "../../ethernet";
import { ETHER_TYPES } from "../../ethernet/types";
import { PROTOCOLS } from "../../ip/packet/protocols";
import { IPPacketV4 } from "../../ip/packet/v4";
import { IPPacketV6 } from "../../ip/packet/v6";
import { AddressV4 } from "../../ip/v4";
import { ICMPPacketV4, ICMPV4_TYPES, createROHEcho } from "../../ip/v4/icmp";
import { AddressV6 } from "../../ip/v6";
import { ICMPPacketV6, ICMPV6_TYPES } from "../../ip/v6/icmp";
import { Host } from "../host";
import { resolveSendingInformationVersion4, resolveSendingInformationVersion6 } from "../host/resolve-sending-information";


/*

    IMPORTANT PLEASE READ

    I need to revisit the implementation because this should respond in different ways
*/


export async function pingVersion4(host: Host, destination: AddressV4, identifier = Math.floor(Math.random() * 1_000), sequence = 0) {
    let icmpPacket = new ICMPPacketV4(ICMPV4_TYPES.ECHO_REQUEST, 0, createROHEcho(identifier, sequence))

    let entry = await resolveSendingInformationVersion4(host, destination);
    if (!entry.iface.isConnected || !entry.iface.ipAddressV4) {
        // failed because interface does not have ipv4 configured
        // return;
        // Do nothing because i haven't decided if the device should have an async send function. So thats why this allows me to have an device ping it self
    }

    let ipv4Packet = new IPPacketV4(entry.iface.ipAddressV4!, destination, PROTOCOLS.ICMP, icmpPacket.bits);
    let frame = new EthernetFrame(entry.macAddress, entry.iface.macAddress, ETHER_TYPES.IPv4, ipv4Packet.bits)

    // console.log("%c ECHO Reply recieved: " + host.name, ['background: green', 'color: white', 'display: block', 'text-align: center', 'font-size: 24px'].join(';'))
    return new Promise<EthernetFrame>(resolve => host.statefulSend(frame, resolve))
}

export async function pingVersion6(host: Host, destination: AddressV6, identifier = Math.floor(Math.random() * 1_000), sequence = 0) {
    let icmpPacket = new ICMPPacketV6(ICMPV6_TYPES.ECHO_REQUEST, 0, createROHEcho(identifier, sequence))
    let entry = await resolveSendingInformationVersion6(host, destination)
    if (!entry.iface.isConnected || !entry.iface.ipAddressV6) {
        // refer to commments in version 4
    }

    let ipPacket = new IPPacketV6(entry.iface.ipAddressV6!, destination, PROTOCOLS.IPV6_ICMP, icmpPacket.bits);
    let frame = new EthernetFrame(entry.macAddress, entry.iface.macAddress, ETHER_TYPES.IPv6, ipPacket.bits)

    return new Promise<EthernetFrame>(resolve => host.statefulSend(frame, resolve))
}

export default async function ping(host: Host, destination: AddressV4 | AddressV6, identifier = Math.floor(Math.random() * 1_000), sequence = 0) {

    if (destination instanceof AddressV4) {
        return await pingVersion4(host, destination);
    } else {
        return await pingVersion6(host,destination)
    }

}