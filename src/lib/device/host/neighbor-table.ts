import { BitArray } from "../../binary";
import { EthernetFrame, MACAddress } from "../../ethernet";
import { ARPPacket, OPCODES } from "../../ethernet/arp";
import { ETHER_TYPES } from "../../ethernet/types";
import { PROTOCOLS } from "../../ip/packet/protocols";
import { IPPacketV6 } from "../../ip/packet/v6";
import { AddressV4 } from "../../ip/v4";
import { ALL_LINK_LOCAL_NODES_ADDRESSV6, AddressV6 } from "../../ip/v6";
import { ICMPPacketV6, ICMPV6_TYPES } from "../../ip/v6/icmp";
import { Interface } from "../interface";
import { Host } from "./host";

const ADDRESS_V6_SIMPLIFY = -1;

export type NeighborEntry<AddressT = (AddressV4 | AddressV6)> = {
    neighbor: AddressT;
    iface: Interface;
    macAddress: MACAddress;
    createdAt: number;
};

export const NEIGHBOR_DISCOVERY_ERROR = {
    NONE: -1,
    TIMEOUT: 1,
} as const;
export type NeighborDiscoveryError = typeof NEIGHBOR_DISCOVERY_ERROR[keyof typeof NEIGHBOR_DISCOVERY_ERROR];

export default class NeighborTable {
    version4: Map<string, NeighborEntry<AddressV4>>;
    version6: Map<string, NeighborEntry<AddressV6>>;

    private host: Host;

    constructor(host: Host, private timeout = 100) {
        this.host = host;

        this.version4 = new Map();
        this.version6 = new Map();
    }

    private getVersion4(query: AddressV4): NeighborEntry<AddressV4> | null {
        return this.version4.get(query.toString()) || null;
    }
    private getVersion6(query: AddressV6): NeighborEntry<AddressV6> | null {
        return this.version6.get(query.toString(ADDRESS_V6_SIMPLIFY)) || null;
    }

    get(query: AddressV4 | AddressV6): NeighborEntry<typeof query> | null {
        if (query instanceof AddressV4) {
            return this.getVersion4(query);
        } else if (query instanceof AddressV6) {
            return this.getVersion6(query);
        }

        return null;
    }

    discoverVersion4(query: AddressV4): Promise<NeighborDiscoveryError> {

        // in the future i would have sockets on the host 
        // then this would have a callback that gets called

        return new Promise<NeighborDiscoveryError>((resolve) => {
            let indices: Array<number> = []
            for (let iface of this.host.interfaces) {
                let f = createARPRequest(query, iface)
                if (!f) return;
                indices.push(this.host.statefulSend(f, (frame, iface) => {
                    let arpPacket = new ARPPacket(frame.payload);

                    this.version4.set(query.toString(), {
                        neighbor: query,
                        iface,
                        macAddress: new MACAddress(arpPacket.targetHardware),
                        createdAt: Date.now()
                    })

                    // clean up
                    indices.forEach(sidx => this.host.statefulClose(sidx))
                    resolve(NEIGHBOR_DISCOVERY_ERROR.NONE);
                }))

            }
            setTimeout(() => {
                // clean up
                indices.forEach(sidx => this.host.statefulClose(sidx))
                resolve(NEIGHBOR_DISCOVERY_ERROR.TIMEOUT);
            }, this.timeout);
        })
    };

    discoverVersion6(query: AddressV6): Promise<NeighborDiscoveryError> {
        return new Promise<NeighborDiscoveryError>(resolve => {
            let indices: Array<number> = []

            for (let iface of this.host.interfaces) {
                let f = createNDPRequest(query, iface)
                if (!f) return;
                indices.push(this.host.statefulSend(f, (frame, iface) => {
                    let arpPacket = new ARPPacket(frame.payload);

                    this.version6.set(query.toString(ADDRESS_V6_SIMPLIFY), {
                        neighbor: query,
                        iface,
                        macAddress: new MACAddress(arpPacket.targetHardware),
                        createdAt: Date.now()
                    })

                    // clean up
                    indices.forEach(sidx => this.host.statefulClose(sidx))
                    resolve(NEIGHBOR_DISCOVERY_ERROR.NONE);
                }))

                // clean up
                indices.forEach(sidx => this.host.statefulClose(sidx))
            }

            setTimeout(() => {
                // clean up
                indices.forEach(sidx => this.host.statefulClose(sidx))
                resolve(NEIGHBOR_DISCOVERY_ERROR.TIMEOUT);
            }, this.timeout);
        });
    };

    discover(query: AddressV4 | AddressV6): Promise<NeighborDiscoveryError> {
        if (query instanceof AddressV4) {
            return this.discoverVersion4(query);
        } else if (query instanceof AddressV6) {
            return this.discoverVersion6(query);
        }

        throw new Error("cannot discover")
    };

    async getDiscover(query: AddressV4 | AddressV6): Promise<NeighborEntry<typeof query> | NeighborDiscoveryError> {
        let entry = this.get(query);

        if (entry) {
            return entry;
        }

        let error = await this.discover(query);

        if (error != NEIGHBOR_DISCOVERY_ERROR.NONE) {
            return error;
        }

        return this.getDiscover(query);
    }
}

function createARPRequest(query: AddressV4, iface: Interface): EthernetFrame | null {
    if (!iface.isConnected || !iface.ipAddressV4) {
        return null;
    }

    let arpPacket = new ARPPacket(
        OPCODES.REQUEST,
        iface.macAddress.bits,
        iface.ipAddressV4!.bits,
        new MACAddress(new BitArray(1, MACAddress.address_length)).bits,
        query.bits
    )

    // wrap packet in ethernet frame
    return new EthernetFrame(new MACAddress(new BitArray(1, MACAddress.address_length)), iface.macAddress, ETHER_TYPES.ARP, arpPacket.bits)
}

function createNDPRequest(query: AddressV6, iface: Interface): EthernetFrame | null {
    if (!iface.isConnected || !iface.ipAddressV6) {
        return null;
    }

    let icmpv6Packet = new ICMPPacketV6(ICMPV6_TYPES.NEIGHBOR_SOLICITATION, 0, null, query.bits);
    let ipPacketv6 = new IPPacketV6(
        iface.ipAddressV6!,
        new AddressV6(ALL_LINK_LOCAL_NODES_ADDRESSV6),
        PROTOCOLS.IPV6_ICMP,
        icmpv6Packet.bits);

    return new EthernetFrame(new MACAddress(new BitArray(1, MACAddress.address_length)), iface.macAddress, ETHER_TYPES.IPv6, ipPacketv6.bits);
}