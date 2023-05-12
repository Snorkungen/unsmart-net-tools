import { BitArray } from "../binary";
import { EthernetFrame, MACAddress } from "../ethernet";
import { ARPPacket } from "../ethernet/arp";
import { ETHER_TYPES } from "../ethernet/types";
import { AddressV4 } from "../ip/v4";
import { ICMPPacketV4 } from "../ip/v4/icmp";
import { IPPacketV4 } from "../ip/packet/v4";
import { ARPTable } from "./arp-table";
import { Interface } from "./interface";
import { PROTOCOLS } from "../ip/packet/protocols";
import { AddressV6 } from "../ip/v6";

let macAddressCount = 0;
let startBits = new BitArray(0, 24).or(new BitArray("fa20f0", 16));
function createMacAddress() {
    return new MACAddress(startBits.concat(
        new BitArray(0, 14).or(new BitArray(macAddressCount++)),
        new BitArray(0, 10).or(new BitArray(Math.floor(Math.random() * (2 ** 10 - 1)))),
    ))
}

export async function resolveMACAddress(device: Device, address: AddressV4 | AddressV6) {
    try {
        if (address instanceof AddressV6) {
            throw new Error("ipv6 not implemented")
        } else {
            // address is v4
    
            let iface: Interface | null = null;
            // check if inside subnet   
    
            for (let opt of device.interfaces) {
                if (!opt.ipAddressV4 || !opt.subnetMaskV4) {
                    continue;
                }
    
                if (address.bits.and(opt.subnetMaskV4.bits).toNumber() == opt.ipAddressV4.bits.and(opt.subnetMaskV4.bits).toNumber()) {
                    // interface address is in the same subnet
                    return await device.arpTable.getSend(address)
                }
            }
    
    
            throw new Error("Default gateway logic not implemented")
    
        }
    } catch (err) {
        // handle logic where no mac address found
        console.error(err)
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
                console.info(`packet is an ICMP packet(${icmpPacket.type == 0 && "Reply" || icmpPacket.type == 8 && "Request" || icmpPacket.type})`)

                if (icmpPacket.type == 0) {
                    // icmp reply

                    console.log("%c ECHO Reply recieved", ['background: green', 'color: white', 'display: block', 'text-align: center', 'font-size: 24px'].join(';'))
                    return;
                } else if (icmpPacket.type == 8) {
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

            if (arpPacket.operation == 1) {
                // request

                // console.log(new AddressV4(arpPacket.targetProtocol).toString(), iface.ipAddressV4?.toString())
                if (arpPacket.targetProtocol.toNumber() != iface.ipAddressV4?.bits.toNumber()) {
                    // ignore if not intended target
                    return;
                }

                // reply to request
                let replyARPPacket = new ARPPacket(2, arpPacket.senderHardware, arpPacket.senderProtocol, iface.macAddress.bits, iface.ipAddressV4!.bits);
                // ethertype should be an enum
                let ethernetFrame = new EthernetFrame(frame.source, iface.macAddress, ETHER_TYPES.ARP, replyARPPacket.bits);
                iface.send(ethernetFrame);

                // idk know if i should add an entry to the arp table
            } else if (arpPacket.operation == 2) {
                // reply

                // add to arp table
                let neighbour = new AddressV4(arpPacket.targetProtocol);
                let macAddress = new MACAddress(arpPacket.targetHardware);

                this.arpTable.add(neighbour, macAddress, iface);
            }
        }
    }

    createInterface(): Interface {
        let iface = new Interface(this.interfaces.length, createMacAddress(), this.listener.bind(this))
        this.interfaces.push(iface);
        return iface;
    }
}