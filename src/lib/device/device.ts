import { BitArray } from "../binary";
import { EthernetFrame, MACAddress } from "../ethernet";
import { ARPPacket, OPCODES } from "../ethernet/arp";
import { ETHER_TYPES } from "../ethernet/types";
import { AddressV4 } from "../ip/v4";
import { ICMPPacketV4, ICMP_TYPES } from "../ip/v4/icmp";
import { IPPacketV4 } from "../ip/packet/v4";
import { ARPTable } from "./arp-table";
import { Interface } from "./interface";
import { PROTOCOL, PROTOCOLS } from "../ip/packet/protocols";
import { AddressV6 } from "../ip/v6";

let macAddressCount = 0;
let startBits = new BitArray(0, 24).or(new BitArray("fa20f0", 16));
function createMacAddress() {
    return new MACAddress(startBits.concat(
        new BitArray(0, 14).or(new BitArray(macAddressCount++)),
        new BitArray(0, 10).or(new BitArray(Math.floor(Math.random() * (2 ** 10 - 1)))),
    ))
}

export async function resolveSendingInformation(device: Device, address: AddressV4 | AddressV6) {
    try {
        if (address instanceof AddressV6) {
            throw new Error("ipv6 not implemented")
        } else {
            // address is v4

            // check if inside subnet   
            for (let opt of device.interfaces) {
                if (!opt.ipAddressV4 || !opt.subnetMaskV4) {
                    continue;
                }

                if (opt.ipAddressV4.toString() == address.toString()) {
                    // return if the destination is itself
                    return { destination: opt.ipAddressV4, macAddress: opt.macAddress, iface: opt }
                }

                if (address.bits.and(opt.subnetMaskV4.bits).toNumber() == opt.ipAddressV4.bits.and(opt.subnetMaskV4.bits).toNumber()) {
                    // interface address is in the same subnet
                    let entry = await device.arpTable.getSend(address)
                    return { destination: entry.neighbour, macAddress: entry.address, iface: entry.iface }
                }
            }


            throw new Error("Default gateway logic not implemented")

        }
    } catch (err) {
        // handle logic where no mac address found
        throw err;
    }
}

export class Device {
    name = Math.floor(Math.random() * 10_000).toString() + "A";
    interfaces: Interface[] = [];

    arpTable = new ARPTable(this);

    listener(frame: EthernetFrame, iface: Interface) {
        // magic function that interperets and responds to packets

        // inform about request
        console.info(`${this.name} recieved on interface: ${iface.ifID}, from ${frame.source.toString()}`)

        if (frame.type == ETHER_TYPES.IPv4) {
            // ipv4 packet
            let ipPacket = new IPPacketV4(frame.payload);

            if (ipPacket.destination.toString() != iface.ipAddressV4?.toString()) {
                // ignore, wrong destination
                return;
            }

            if (ipPacket.protocol == PROTOCOLS.ICMP) {
                // icmp packet
                let icmpPacket = new ICMPPacketV4(ipPacket.payload);
                console.info(`packet is an ICMP packet(${icmpPacket.type == ICMP_TYPES.ECHO_REPLY && "Reply" || icmpPacket.type == ICMP_TYPES.ECHO_REQUEST && "Request" || icmpPacket.type})`)

                if (icmpPacket.type == ICMP_TYPES.ECHO_REPLY) {
                    // icmp reply

                    console.log("%c ECHO Reply recieved", ['background: green', 'color: white', 'display: block', 'text-align: center', 'font-size: 24px'].join(';'))
                    return;
                } else if (icmpPacket.type == ICMP_TYPES.ECHO_REQUEST) {
                    // icmp request

                    // reply to request
                    let replyICMPPacket = new ICMPPacketV4(0, 0, ICMPPacketV4.getIPPacketBits(ipPacket));
                    // protocol should be an enum
                    let replyIPPacket = new IPPacketV4(iface.ipAddressV4!, ipPacket.source, 0x01, replyICMPPacket.bits);
                    let ethernetFrame = new EthernetFrame(frame.source, iface.macAddress, ETHER_TYPES.IPv4, replyIPPacket.bits);

                    return iface.send(ethernetFrame);
                }
            }

        } else if (frame.type == ETHER_TYPES.ARP) {
            // handle an arp packet
            let arpPacket = new ARPPacket(frame.payload);

            console.info(`packet is an ARP(${arpPacket.operation == 1 && "Request" || arpPacket.operation == 2 && "Reply"})`)

            if (arpPacket.operation == OPCODES.REQUEST) {
                // request

                if (arpPacket.targetProtocol.toNumber() != iface.ipAddressV4?.bits.toNumber()) {
                    // ignore if not intended target
                    return;
                }

                // reply to request
                let replyARPPacket = new ARPPacket(2, arpPacket.senderHardware, arpPacket.senderProtocol, iface.macAddress.bits, iface.ipAddressV4!.bits);
                let ethernetFrame = new EthernetFrame(frame.source, iface.macAddress, ETHER_TYPES.ARP, replyARPPacket.bits);
                iface.send(ethernetFrame);

                // idk know if i should add an entry to the arp table
            } else if (arpPacket.operation == OPCODES.REPLY) {
                // reply

                // add to arp table
                let neighbour = new AddressV4(arpPacket.targetProtocol);
                let macAddress = new MACAddress(arpPacket.targetHardware);

                this.arpTable.add(neighbour, macAddress, iface);
            }
        }
    }

    async send(destination: AddressV4 | AddressV6, protocol: PROTOCOL, packet: { bits: BitArray }) {
        try {
            let { iface, macAddress } = await resolveSendingInformation(this, destination);
            if (destination instanceof AddressV4) {
                if (!iface.isConnected || !iface.ipAddressV4 || !iface.subnetMaskV4) {
                    // failed because interface does not have ipv4 configured
                    // return;
                    // Do nothing because i haven't decided if the device should have an async send function. So thats why this allows me to have an device ping it self
                }
                let ipPacket = new IPPacketV4(iface.ipAddressV4!, destination, protocol, packet.bits);
                let ethernetFrame = new EthernetFrame(macAddress, iface.macAddress, ETHER_TYPES.IPv4, ipPacket.bits);
                iface.send(ethernetFrame);
            }
        } catch (error) {
            console.error(error)
            // Here i should return ICMP host unreachaple or network unreachable depending on error code
            throw new Error("Failed to send packet to: " + destination.toString()) // figuring out how is an obstacle
        }
    }

    createInterface(): Interface {
        let iface = new Interface(this.interfaces.length, createMacAddress(), this.listener.bind(this))
        this.interfaces.push(iface);
        return iface;
    }
}