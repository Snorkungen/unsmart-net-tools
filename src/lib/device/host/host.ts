import { Interface } from "../interface";
import { Device } from "../device";

import NeighborTable from "./neighbor-table";
import resolveSendingInformation from "./resolve-sending-information";
import { IPV4Address } from "../../address/ipv4";
import { IPV6Address ,ALL_LINK_LOCAL_NODES_ADDRESSV6} from "../../address/ipv6";
import { ETHERNET_HEADER, ETHER_TYPES, EtherType } from "../../header/ethernet";
import { IPV4_HEADER, IPV6_HEADER, PROTOCOLS, type Protocol } from "../../header/ip";
import { ICMP_ECHO_HEADER, ICMP_HEADER, ICMP_NDP_HEADER, ICMPV4_TYPES, ICMPV6_TYPES } from "../../header/icmp";
import { calculateChecksum } from "../../binary/checksum";
import { ARP_HEADER, ARP_OPCODES } from "../../header/arp";
import { Struct } from "../../binary/struct";

/**
 *  this function contains logic if device should ignore this packet based upon destination address
 * @param address 
 * @param iface 
 * @returns 
 */
function ignoreIPPacketHost(address: IPV4Address | IPV6Address, iface: Interface) {
    if (address instanceof IPV4Address) {
        if (address.toString() == iface.ipv4Address?.toString()) {
            return false
        }
    } else if (address instanceof IPV6Address) {
        if (address.toString(-1) == new IPV6Address(ALL_LINK_LOCAL_NODES_ADDRESSV6).toString(-1)) {
            return false;
        }
        if (address.toString(-1) == iface.ipv6Address?.toString(-1)) {
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
    listener(frame: typeof ETHERNET_HEADER, iface: Interface) {
        // inform about request
        this.log(frame, iface);
        if (frame.get("dmac").toString() != iface.macAddress.toString()) {
            if (!frame.get("dmac").isBroadcast()) {
                // meant for wrong interface
                return;
            }
        }
        
        if (frame.get("ethertype") == ETHER_TYPES.IPv4) {
            // ipv4 packet
            let ipHdr = IPV4_HEADER.create(frame.get("payload").subarray(0));
            
            if (ignoreIPPacketHost(ipHdr.get("daddr"), iface)) {
                // ignore, wrong destination
                return;
            }

            if (ipHdr.get("proto") == PROTOCOLS.ICMP) {
                // icmp packet
                let icmpHdr = ICMP_HEADER.create(ipHdr.get("payload"));
                console.info(`packet is an ICMP packet(${icmpHdr.get("type") == ICMPV4_TYPES.ECHO_REPLY && "Reply" || icmpHdr.get("type") == ICMPV4_TYPES.ECHO_REQUEST && "Request" || icmpHdr.get("type")})`)
                if (icmpHdr.get("type") == ICMPV4_TYPES.ECHO_REQUEST) {
                    // icmp request
                    // reply to request
                    let replyIcmpHdr = ICMP_HEADER.create({
                        type: ICMPV4_TYPES.ECHO_REPLY,
                        data: icmpHdr.get("data")
                    })

                    // I have no clue if this is the right way to calculate the checksum
                    replyIcmpHdr.set("csum", calculateChecksum(replyIcmpHdr.getBuffer()));

                    let replyIPHeader = IPV4_HEADER.create({
                        saddr: iface.ipv4Address!,
                        daddr: ipHdr.get("saddr"),
                        proto: PROTOCOLS.ICMP,
                        payload: replyIcmpHdr.getBuffer()
                    })

                    // I have no clue if this is the right way to calculate the checksum
                    replyIPHeader.set("csum", calculateChecksum(replyIPHeader.getBuffer()));

                    return iface.send(ETHERNET_HEADER.create({
                        smac: iface.macAddress,
                        dmac: frame.get("smac"),
                        ethertype: ETHER_TYPES.IPv4,
                        payload: replyIPHeader.getBuffer()
                    }));
                }
            }

        } else if (frame.get("ethertype") == ETHER_TYPES.IPv6) {
            let ipHdr = IPV6_HEADER.create(frame.get("payload"));
            // ignore if not matches parameter
            
            if (ignoreIPPacketHost(ipHdr.get("daddr"), iface)) {
                return;
            }
            if (ipHdr.get("nextHeader") == PROTOCOLS.IPV6_ICMP) {
                let icmpHdr = ICMP_HEADER.create(ipHdr.get("payload"));
                if (icmpHdr.get("type") == ICMPV6_TYPES.ECHO_REQUEST) {
                    let replyIcmpHdr = ICMP_HEADER.create({
                        type: ICMPV6_TYPES.ECHO_REPLY,
                        data: icmpHdr.get("data")
                    })
                    
                    // I have no clue if this is the right way to calculate the checksum
                    replyIcmpHdr.set("csum", calculateChecksum(replyIcmpHdr.getBuffer()));
                    
                    let replyIPHdr = IPV6_HEADER.create({
                        saddr: iface.ipv6Address,
                        daddr: ipHdr.get("saddr"),
                        nextHeader: PROTOCOLS.IPV6_ICMP,
                        payloadLength: icmpHdr.size,
                        payload: replyIcmpHdr.getBuffer()
                    })
                    
                    return iface.send(ETHERNET_HEADER.create({
                        smac: iface.macAddress,
                        dmac: frame.get("smac"),
                        ethertype: ETHER_TYPES.IPv6,
                        payload: replyIPHdr.getBuffer()
                    }));
                } else if (icmpHdr.get("type") == ICMPV6_TYPES.NEIGHBOR_SOLICITATION) {
                    // check if target is me
                    let ndpHdr = ICMP_NDP_HEADER.create(icmpHdr.get("data"))
                    if (ndpHdr.get("targetAddress").toString() != iface.ipv6Address!.toString()) {
                        return;
                    }
                    // respond with neighbor solicitation

                    let replyIcmpHdr = ICMP_HEADER.create({
                        type: ICMPV6_TYPES.NEIGHBOR_ADVERTISMENT,
                        data: ndpHdr.getBuffer()
                    })
                    // I have no clue if this is the right way to calculate the checksum
                    replyIcmpHdr.set("csum", calculateChecksum(replyIcmpHdr.getBuffer()));

                    let replyIPHdr = IPV6_HEADER.create({
                        saddr: iface.ipv6Address,
                        daddr: ipHdr.get("saddr"),
                        nextHeader: PROTOCOLS.IPV6_ICMP,
                        payloadLength: icmpHdr.size,
                        payload: replyIcmpHdr.getBuffer()
                    })

                    return iface.send(ETHERNET_HEADER.create({
                        smac: iface.macAddress,
                        dmac: frame.get("smac"),
                        ethertype: ETHER_TYPES.IPv6,
                        payload: replyIPHdr.getBuffer()
                    }));
                }
            }

        } else if (frame.get("ethertype") == ETHER_TYPES.ARP) {
            // handle an arp packet
            let arpHdr = ARP_HEADER.create(frame.get("payload"));

            // console.info(`packet is an ARP(${arpHdr.get("oper") == 1 && "Request" || arpHdr.get("oper") == 2 && "Reply"})`)

            if (arpHdr.get("oper") == ARP_OPCODES.REQUEST) {
                // request

                if (arpHdr.get("tpa").toString() != iface.ipv4Address!.toString()) {
                    // ignore if not intended target
                    return;
                }

                // reply to request
                let replyArpHdr = ARP_HEADER.create(arpHdr.getBuffer());
                replyArpHdr.set("oper", ARP_OPCODES.REPLY);
                replyArpHdr.set("tha", iface.macAddress);
                replyArpHdr.set("tpa", iface.ipv4Address!);

                // wrap packet in ethernet frame
                return iface.send(ETHERNET_HEADER.create({
                    dmac: frame.get("smac"),
                    smac: iface.macAddress,
                    ethertype: ETHER_TYPES.ARP,
                    payload: replyArpHdr.getBuffer()
                }))

                // idk know if i should add an entry to the arp table
            }
        }

        this.statefulRecv(frame, iface)
    }

    async send(destination: IPV4Address | IPV6Address, protocol: Protocol, payload: Struct<any>) {
        try {
            let { iface, macAddress } = await resolveSendingInformation(this, destination);
            if (destination instanceof IPV4Address) {
                if (!iface.isConnected || !iface.ipv4Address || !iface.ipv4SubnetMask) {
                    // failed because interface does not have ipv4 configured
                    // return;
                    // Do nothing because i haven't decided if the device should have an async send function. So thats why this allows me to have an device ping it self
                }
                let ipHdr = IPV4_HEADER.create({
                    saddr: iface.ipv4Address!,
                    daddr: destination,
                    proto: protocol,
                    payload: payload.getBuffer()
                })

                // I have no clue if this is the right way to calculate the checksum
                ipHdr.set("csum", calculateChecksum(ipHdr.getBuffer()));

                iface.send(ETHERNET_HEADER.create({
                    dmac: macAddress,
                    smac: iface.macAddress,
                    ethertype: ETHER_TYPES.IPv4,
                    payload: ipHdr.getBuffer()
                }));
            } else {
                throw new Error("Not implemented")
            }
        } catch (error) {
            console.error(error)
            // Here i should return ICMP host unreachaple or network unreachable depending on error code
            throw new Error("Failed to send packet to: " + destination.toString()) // figuring out how is an obstacle
        }
    }

    state: ({ ethertype: EtherType, cb: (frame: typeof ETHERNET_HEADER, iface: Interface) => void } & {
        tpa?: string;
        destP?: string;
        proto?: Protocol;
        id?: number;
    })[] = []

    statefulRecv(frame: typeof ETHERNET_HEADER, iface: Interface) {
        for (let i = 0; i < this.state.length; i++) {
            let s = this.state.at(i);

            if (!s) {
                continue;
            }

            if (frame.get("ethertype") != s.ethertype) {
                continue;
            }

            if (s.ethertype == ETHER_TYPES.ARP) {
                let arpHdr = ARP_HEADER.create(frame.get("payload"));

                // only care about arp replies
                if (arpHdr.get("oper") != ARP_OPCODES.REPLY) {
                    continue;
                }
                if (s.tpa != arpHdr.get("tpa").toString()) {
                    continue;
                }

                s.cb(frame, iface);
                return this.statefulClose(i);
            } else if (s.ethertype == ETHER_TYPES.IPv4) {
                let ipHdr = IPV4_HEADER.create(frame.get("payload"));

                if (ipHdr.get("saddr").toString() != s.destP) {
                    continue;
                }

                if (ipHdr.get("proto") == PROTOCOLS.ICMP) {
                    let icmpHdr = ICMP_HEADER.create(ipHdr.get("payload"));
                    // I don't think this is following spec

                    // In here i can respond to icmp replies for ipv4 messages
                    if (icmpHdr.get("type") == ICMPV4_TYPES.ECHO_REPLY && ICMP_ECHO_HEADER.create(icmpHdr.get("data")).get("id") == s.id) {
                        s.cb(frame, iface);
                        return this.statefulClose(i);
                    }


                    // here i would check if the icmp header is an error and match the erro to something

                }
            } else if (s.ethertype == ETHER_TYPES.IPv6) {
                let ipHdr = IPV6_HEADER.create(frame.get("payload"));
                // only support icmp first
                if (ipHdr.get("nextHeader") == PROTOCOLS.IPV6_ICMP) {
                    let icmpHdr = ICMP_HEADER.create(ipHdr.get("payload"))

                    if (icmpHdr.get("type") == ICMPV6_TYPES.NEIGHBOR_ADVERTISMENT && (s.tpa == ICMP_NDP_HEADER.create(icmpHdr.get("data")).get("targetAddress").toString())) {
                        s.cb(frame, iface);
                        return this.statefulClose(i)
                    }

                    if (icmpHdr.get("type") == ICMPV6_TYPES.ECHO_REPLY && ICMP_ECHO_HEADER.create(icmpHdr.get("data")).get("id") == s.id) {
                        s.cb(frame, iface);
                        return this.statefulClose(i)
                    }

                }
            }
        }
    }

    statefulSend(frame: typeof ETHERNET_HEADER, cb: (frame: typeof ETHERNET_HEADER, iface: Interface) => void) {
        let iface = this.interfaces.find(({ macAddress }) => macAddress.toString() == frame.get("smac").toString());
        if (!iface) {
            throw new Error("No interface for source address")
        }

        // first only support arp
        if (frame.get("ethertype") == ETHER_TYPES.ARP) {
            let arpHdr = ARP_HEADER.create(frame.get("payload"));
            // only care about arp requests
            if (arpHdr.get("oper") == ARP_OPCODES.REQUEST) {
                let sidx = this.state.push({
                    ethertype: frame.get("ethertype"),
                    cb,
                    tpa: arpHdr.get("tpa").toString()
                })

                iface.send(frame);
                return sidx;
            }
        } else if (frame.get("ethertype") == ETHER_TYPES.IPv4) {
            let ipHdr = IPV4_HEADER.create(frame.get("payload"));
            // only support icmp first
            if (ipHdr.get("proto") == PROTOCOLS.ICMP) {
                let icmpHdr = ICMP_HEADER.create(ipHdr.get("payload"));

                // first only care about echo requests
                if (icmpHdr.get("type") == ICMPV4_TYPES.ECHO_REQUEST) {
                    let sidx = this.state.push({
                        ethertype: frame.get("ethertype"),
                        cb,
                        destP: ipHdr.get("daddr").toString(),
                        proto: ipHdr.get("proto"),
                        id: ICMP_ECHO_HEADER.create(icmpHdr.get("data")).get("id")
                    })

                    iface.send(frame);
                    return sidx;
                }
            }
        } else if (frame.get("ethertype") == ETHER_TYPES.IPv6) {
            let ipHdr = IPV6_HEADER.create(frame.get("payload"));
            // only support icmp first
            if (ipHdr.get("nextHeader") == PROTOCOLS.IPV6_ICMP) {
                let icmpHdr = ICMP_HEADER.create(ipHdr.get("payload"));
                
                if (icmpHdr.get("type") == ICMPV6_TYPES.ECHO_REQUEST) {
                    let sidx = this.state.push({
                        ethertype: frame.get("ethertype"),
                        cb,
                        destP: ipHdr.get("daddr").toString(),
                        proto: ipHdr.get("nextHeader"),
                        id: ICMP_ECHO_HEADER.create(icmpHdr.get("data")).get("id")
                    })
                    iface.send(frame);
                    return sidx
                } else if (icmpHdr.get("type") == ICMPV6_TYPES.NEIGHBOR_SOLICITATION) {
                    let sidx = this.state.push({
                        ethertype: frame.get("ethertype"),
                        cb,
                        proto: ipHdr.get("nextHeader"),
                        tpa: ICMP_NDP_HEADER.create(icmpHdr.get("data")).get("targetAddress").toString()
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