import { BitArray } from "../binary";
import { EthernetFrame, MACAddress } from "../ethernet";
import { ARPPacket, OPCODES } from "../ethernet/arp";
import { ETHER_TYPES, EtherType } from "../ethernet/types";
import { AddressV4 } from "../ip/v4";
import { ICMPPacketV4, ICMP_TYPES, readROHEcho } from "../ip/v4/icmp";
import { IPPacketV4 } from "../ip/packet/v4";
import { ARPTable } from "./arp-table";
import { Interface } from "./interface";
import { PROTOCOL, PROTOCOLS } from "../ip/packet/protocols";
import { AddressV6 } from "../ip/v6";
import { Device } from "./device";

export async function resolveSendingInformation(device: Host, address: AddressV4 | AddressV6) {
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

export class Host extends Device {
    arpTable: ARPTable = new ARPTable(this);

    listener(frame: EthernetFrame, iface: Interface) {
        // inform about request
        this.log(frame, iface);

        /* 

        This function only replies to requests for now
        It might not in the future

        */

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
                // console.info(`packet is an ICMP packet(${icmpPacket.type == ICMP_TYPES.ECHO_REPLY && "Reply" || icmpPacket.type == ICMP_TYPES.ECHO_REQUEST && "Request" || icmpPacket.type})`)
                if (icmpPacket.type == ICMP_TYPES.ECHO_REQUEST) {
                    // icmp request
                    // reply to request
                    let replyICMPPacket = new ICMPPacketV4(ICMP_TYPES.ECHO_REPLY, 0, icmpPacket.roh, ICMPPacketV4.getIPPacketBits(ipPacket));
                    // protocol should be an enum
                    let replyIPPacket = new IPPacketV4(iface.ipAddressV4!, ipPacket.source, PROTOCOLS.ICMP, replyICMPPacket.bits);
                    let ethernetFrame = new EthernetFrame(frame.source, iface.macAddress, ETHER_TYPES.IPv4, replyIPPacket.bits);

                    return iface.send(ethernetFrame);
                }
            }

        } else if (frame.type == ETHER_TYPES.ARP) {
            // handle an arp packet
            let arpPacket = new ARPPacket(frame.payload);

            // console.info(`packet is an ARP(${arpPacket.operation == 1 && "Request" || arpPacket.operation == 2 && "Reply"})`)

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
            }
        }

        this.statefulRecv(frame, iface)
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

    state: ({ type: EtherType, cb: (frame: EthernetFrame, iface: Interface) => void } & Record<string, unknown>)[] = []

    statefulRecv(frame: EthernetFrame, iface: Interface) {
        for (let i = 0; i < this.state.length; i++) {
            let s = this.state.at(i);

            if (!s) {
                continue;
            }

            if (s.type == ETHER_TYPES.ARP && frame.type == s.type) {
                let arpPacket = new ARPPacket(frame.payload);
                // only care about arp replies
                if (arpPacket.operation != OPCODES.REPLY) {
                    continue;
                }
                if (s.targetP != arpPacket.targetProtocol.toNumber()) {
                    continue;
                }

                s.cb(frame, iface);
                return this.statefulClose(i);
            } else if (s.type == ETHER_TYPES.IPv4) {
                let ipPacket = new IPPacketV4(frame.payload);

                if (ipPacket.source.toString() != s.destinationP) {
                    continue;
                }

                if (ipPacket.protocol == PROTOCOLS.ICMP) {
                    let icmpPacket = new ICMPPacketV4(ipPacket.payload);
                    let contentIPPacket = new IPPacketV4(icmpPacket.content);
                    if (contentIPPacket.protocol != s.protocol) {
                        continue;
                    }

                    // In here i can respond to icmp replies for ipv4 messages

                    if (contentIPPacket.protocol == PROTOCOLS.ICMP) {
                        let contentICMPPacket = new ICMPPacketV4(contentIPPacket.payload);
                        if (contentICMPPacket.type == ICMP_TYPES.ECHO_REQUEST) {
                            let { identifier } = readROHEcho(contentICMPPacket.roh);
                            if (s.identifier == identifier) {
                                // this is a response to my ping request
                                s.cb(frame, iface);
                                return this.statefulClose(i);
                            }
                        }
                    }
                }
            }
        }
    }

    statefulSend(frame: EthernetFrame, cb: (frame: EthernetFrame, iface: Interface) => void) {
        let iface = this.interfaces.find(({ macAddress }) => macAddress.toString() == frame.source.toString());
        if (!iface) {
            throw new Error("No interface for source address")
        }

        // first only support arp
        if (frame.type == ETHER_TYPES.ARP) {
            let arpPacket = new ARPPacket(frame.payload);
            // only care about arp requests
            if (arpPacket.operation == OPCODES.REQUEST) {
                let sidx = this.state.push({
                    type: frame.type,
                    cb,
                    targetP: arpPacket.targetProtocol.toNumber()
                })

                iface.send(frame);
                return sidx;
            }
        } else if (frame.type == ETHER_TYPES.IPv4) {
            let ipPacket = new IPPacketV4(frame.payload);
            // only support icmp first
            if (ipPacket.protocol == PROTOCOLS.ICMP) {
                let icmpPacket = new ICMPPacketV4(ipPacket.payload);

                // first only care about echo requests
                if (icmpPacket.type == ICMP_TYPES.ECHO_REQUEST) {
                    let { identifier } = readROHEcho(icmpPacket.roh);
                    let sidx = this.state.push({
                        type: frame.type,
                        cb,
                        destinationP: ipPacket.destination.toString(),
                        protocol: ipPacket.protocol,
                        identifier: identifier
                    })

                    iface.send(frame);
                    return sidx;
                }
            }
        }


        throw new Error("cannot send frame!")
    }

    /** sidx "state index" */
    statefulClose(sidx: number) {
        delete this.state[sidx];
    }
}