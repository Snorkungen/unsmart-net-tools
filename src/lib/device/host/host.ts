import { BitArray } from "../../binary";
import { EthernetFrame, MACAddress } from "../../ethernet";
import { ARPPacket, OPCODES } from "../../ethernet/arp";
import { ETHER_TYPES, EtherType } from "../../ethernet/types";
import { AddressV4 } from "../../ip/v4";
import { ICMPPacketV4, ICMPV4_TYPES, readROHEcho } from "../../ip/v4/icmp";
import { IPPacketV4 } from "../../ip/packet/v4";
import { Interface } from "../interface";
import { PROTOCOL, PROTOCOLS } from "../../ip/packet/protocols";
import { AddressV6 } from "../../ip/v6/address";
import { Device } from "../device";
import { IPPacketV6 } from "../../ip/packet/v6";
import { ICMPPacketV6, ICMPV6_TYPES } from "../../ip/v6/icmp";
import { ALL_LINK_LOCAL_NODES_ADDRESSV6 } from "../../ip/v6";
import NeighborTable from "./neighbor-table";
import resolveSendingInformation from "./resolve-sending-information";

/**
 *  this function contains logic if device should ignore this packet based upon destination address
 * @param address 
 * @param iface 
 * @returns 
 */
function ignoreIPPacketHost(address: AddressV4 | AddressV6, iface: Interface) {
    if (address instanceof AddressV4) {


    } else if (address instanceof AddressV6) {
        if (address.toString(-1) == new AddressV6(ALL_LINK_LOCAL_NODES_ADDRESSV6).toString(-1)) {
            return false;
        }
        if (address.toString(-1) == iface.ipAddressV6?.toString(-1)) {
            return false
        }
    }

    return true;
}
export class Host extends Device {
    neighborTable = new NeighborTable(this);
    /**
    This function only replies to requests for now
    It might not in the future
    */
    listener(frame: EthernetFrame, iface: Interface) {
        // inform about request
        this.log(frame, iface);

        if (frame.destination.toString() != iface.macAddress.toString()) {
            if (!frame.destination.isBroadcast) {
                // meant for wrong interface
                return;
            }
        }


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
                if (icmpPacket.type == ICMPV4_TYPES.ECHO_REQUEST) {
                    // icmp request
                    // reply to request
                    let replyICMPPacket = new ICMPPacketV4(ICMPV4_TYPES.ECHO_REPLY, 0, icmpPacket.roh, ICMPPacketV4.getIPPacketBits(ipPacket));
                    // protocol should be an enum
                    let replyIPPacket = new IPPacketV4(iface.ipAddressV4!, ipPacket.source, PROTOCOLS.ICMP, replyICMPPacket.bits);
                    let ethernetFrame = new EthernetFrame(frame.source, iface.macAddress, ETHER_TYPES.IPv4, replyIPPacket.bits);

                    return iface.send(ethernetFrame);
                }
            }

        } else if (frame.type == ETHER_TYPES.IPv6) {
            let ipPacket = new IPPacketV6(frame.payload);

            // ignore if not matches parameter

            if (ignoreIPPacketHost(ipPacket.destination, iface)) {
                return;
            }

            if (ipPacket.nextHeader == PROTOCOLS.IPV6_ICMP) {
                let icmpPacket = new ICMPPacketV6(ipPacket.payload);
                if (icmpPacket.type == ICMPV6_TYPES.ECHO_REQUEST) {
                    let replyICMPPacket = new ICMPPacketV6(ICMPV6_TYPES.ECHO_REPLY, 0, icmpPacket.roh, ICMPPacketV6.getIPPacketBits(ipPacket));
                    let replyIPPacket = new IPPacketV6(iface.ipAddressV6!, ipPacket.source, PROTOCOLS.IPV6_ICMP, replyICMPPacket.bits);
                    let replyFrame = new EthernetFrame(frame.source, iface.macAddress, ETHER_TYPES.IPv6, replyIPPacket.bits);
                    return iface.send(replyFrame)
                } else if (icmpPacket.type == ICMPV6_TYPES.NEIGHBOR_SOLICITATION) {
                    // check if target is me
                    let target = icmpPacket.content.slice(0, AddressV6.address_length);
                    if (target.toNumber() != iface.ipAddressV6?.bits.toNumber()) {
                        return;
                    }
                    // respond with neighbor solicitation

                    let icmpv6Packet = new ICMPPacketV6(ICMPV6_TYPES.NEIGHBOR_ADVERTISMENT, 0, null, target);
                    let ipPacketv6 = new IPPacketV6(
                        iface.ipAddressV6!,
                        ipPacket.source,
                        PROTOCOLS.IPV6_ICMP,
                        icmpv6Packet.bits);

                    let ethernetFrame = new EthernetFrame(frame.source, iface.macAddress, ETHER_TYPES.IPv6, ipPacketv6.bits)

                    return iface.send(ethernetFrame)
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
                return iface.send(ethernetFrame);

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

            if (frame.type != s.type) {
                continue;
            }

            if (s.type == ETHER_TYPES.ARP) {
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
                        if (contentICMPPacket.type == ICMPV4_TYPES.ECHO_REQUEST) {
                            let { identifier } = readROHEcho(contentICMPPacket.roh);
                            if (s.identifier == identifier) {
                                // this is a response to my ping request
                                s.cb(frame, iface);
                                return this.statefulClose(i);
                            }
                        }
                    }
                }
            } else if (s.type == ETHER_TYPES.IPv6) {
                let ipPacket = new IPPacketV6(frame.payload);

                if (ipPacket.source.toString() != s.destinationP && ipPacket.source.toString(-1) == ALL_LINK_LOCAL_NODES_ADDRESSV6) {
                    continue;
                }
                // only support icmp first
                if (ipPacket.nextHeader == PROTOCOLS.IPV6_ICMP) {
                    let icmpPacket = new ICMPPacketV6(ipPacket.payload);
                    if (s.icmpType == ICMPV6_TYPES.NEIGHBOR_SOLICITATION) {

                        // assume this is NDP because i'm tired
                        if (s.content instanceof BitArray && s.content.toNumber() == icmpPacket.content.toNumber()) {
                            s.cb(frame, iface);
                            return this.statefulClose(i)
                        }
                    } else {
                        let contentIPPacket = new IPPacketV6(icmpPacket.content);
                        if (contentIPPacket.nextHeader != s.protocol) {
                            continue;
                        }
                        if (contentIPPacket.nextHeader == PROTOCOLS.IPV6_ICMP) {
                            let contentICMPPacket = new ICMPPacketV6(contentIPPacket.payload);

                            if (contentICMPPacket.type == ICMPV6_TYPES.ECHO_REQUEST) {
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
                if (icmpPacket.type == ICMPV4_TYPES.ECHO_REQUEST) {
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
        } else if (frame.type == ETHER_TYPES.IPv6) {
            let ipPacket = new IPPacketV6(frame.payload);

            // only support icmp first
            if (ipPacket.nextHeader == PROTOCOLS.IPV6_ICMP) {
                let icmpPacket = new ICMPPacketV6(ipPacket.payload)

                if (icmpPacket.type == ICMPV6_TYPES.ECHO_REQUEST) {
                    let sidx = this.state.push({
                        type: frame.type,
                        cb,
                        destinationP: ipPacket.destination.toString(),
                        protocol: ipPacket.nextHeader,
                        icmpType: icmpPacket.type,
                        identifier: readROHEcho(icmpPacket.roh).identifier
                    })
                    iface.send(frame);
                    return sidx
                } else if (icmpPacket.type == ICMPV6_TYPES.NEIGHBOR_SOLICITATION) {
                    let sidx = this.state.push({
                        type: frame.type,
                        cb,
                        destinationP: ipPacket.destination.toString(),
                        protocol: ipPacket.nextHeader,
                        icmpType: icmpPacket.type,
                        content: icmpPacket.content
                    })
                    iface.send(frame);
                    return sidx
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