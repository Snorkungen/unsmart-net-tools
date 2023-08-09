import { Buffer } from "buffer";
import { BaseAddress } from "../address/base";
import { IPV4Address } from "../address/ipv4";
import { ALL_LINK_LOCAL_NODES_ADDRESSV6, IPV6Address } from "../address/ipv6";
import { MACAddress } from "../address/mac";
import { calculateChecksum } from "../binary/checksum";
import { ARP_HEADER, ARP_OPCODES, createARPHeader } from "../header/arp";
import { ETHERNET_HEADER, ETHER_TYPES, } from "../header/ethernet";
import { ICMPV6_TYPES, ICMP_HEADER, ICMP_NDP_HEADER } from "../header/icmp";
import { IPV6_HEADER, IPV6_PSEUDO_HEADER, PROTOCOLS } from "../header/ip";
import { Interface } from "./interface";
import { Contact, ContactAddrFamily, ContactProto } from "./contact/contact";
import { Device } from "./device";
import { DeviceServiceAddressResolution } from "./service/address-resolution";

export type NeighborEntry<AddressT extends BaseAddress = BaseAddress> = {
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
    version4: Map<string, NeighborEntry<IPV4Address>>;
    version6: Map<string, NeighborEntry<IPV6Address>>;

    private device: Device;
    private contact: Contact<ContactAddrFamily.RAW, ContactProto.RAW>

    constructor(device: Device, public timeout = 100) {
        this.device = device;

        this.version4 = new Map();
        this.version6 = new Map();

        this.contact = this.device.contactsHandler.createContact(ContactAddrFamily.RAW, ContactProto.RAW);

        // IDK if abstracting t'ings is worthwhile
        this.device.addService(
            new DeviceServiceAddressResolution(this.device,this.contact)
        )
    }
    private getVersion4(query: IPV4Address): NeighborEntry<IPV4Address> | null {
        return this.version4.get(query.toString()) || null;
    }
    private getVersion6(query: IPV6Address): NeighborEntry<IPV6Address> | null {
        return this.version6.get(query.toString()) || null;
    }

    get(query: IPV4Address | IPV6Address): NeighborEntry<typeof query> | null {
        if (query instanceof IPV4Address) {
            return this.getVersion4(query);
        } else if (query instanceof IPV6Address) {
            return this.getVersion6(query);
        }

        return null;
    }

    discoverVersion4(query: IPV4Address): Promise<NeighborDiscoveryError> {
        return new Promise<NeighborDiscoveryError>((resolve) => {
            let interval = setInterval((() => {
                if (this.get(query)) {
                    clearInterval(interval)
                    resolve(NEIGHBOR_DISCOVERY_ERROR.NONE);
                }
            }).bind(this), 15); // Arbitrarily adding delays

            for (let iface of this.device.interfaces) {
                let f = createARPRequest(query, iface)
                if (!f) return;

                this.contact.send(f.getBuffer())
            }

            setTimeout(() => {
                clearInterval(interval)
                if (this.get(query))
                    resolve(NEIGHBOR_DISCOVERY_ERROR.NONE);
                else
                    resolve(NEIGHBOR_DISCOVERY_ERROR.TIMEOUT);
            }, this.timeout);
        })
    };

    discoverVersion6(query: IPV6Address): Promise<NeighborDiscoveryError> {
        return new Promise<NeighborDiscoveryError>(resolve => {
            let interval = setInterval((() => {
                if (this.get(query)) {
                    clearInterval(interval)
                    resolve(NEIGHBOR_DISCOVERY_ERROR.NONE);
                }
            }).bind(this), 15); // Arbitrarily adding delays

            for (let iface of this.device.interfaces) {
                let f = createNDPRequest(query, iface)
                if (!f) continue;
                
                this.contact.send(f.getBuffer())
            }

            setTimeout(() => {
                clearInterval(interval)
                if (this.get(query))
                    resolve(NEIGHBOR_DISCOVERY_ERROR.NONE);
                else
                    resolve(NEIGHBOR_DISCOVERY_ERROR.TIMEOUT);
            }, this.timeout);
        });
    };

    discover(query: IPV4Address | IPV6Address): Promise<NeighborDiscoveryError> {
        if (query instanceof IPV4Address) {
            return this.discoverVersion4(query);
        } else if (query instanceof IPV6Address) {
            return this.discoverVersion6(query);
        }

        throw new Error("cannot discover")
    };

    async getDiscover(query: IPV4Address | IPV6Address): Promise<NeighborEntry<typeof query> | NeighborDiscoveryError> {
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

export const BROADCAST_MAC_ADDRESS = new MACAddress(Buffer.alloc(MACAddress.ADDRESS_LENGTH / 8, 0xff))

function createARPRequest(query: IPV4Address, iface: Interface): typeof ETHERNET_HEADER | null {
    if (!iface.isConnected || !iface.ipv4Address) {
        return null;
    }

    let arpHeader = createARPHeader({
        oper: ARP_OPCODES.REQUEST,
        sha: iface.macAddress,
        spa: iface.ipv4Address,
        tpa: query
    })

    // wrap packet in ethernet frame
    return ETHERNET_HEADER.create({
        dmac: BROADCAST_MAC_ADDRESS,
        smac: iface.macAddress,
        ethertype: ETHER_TYPES.ARP,
        payload: arpHeader.getBuffer()
    })
}

function createNDPRequest(query: IPV6Address, iface: Interface): typeof ETHERNET_HEADER | null {
    if (!iface.isConnected || !iface.ipv6Address) {
        return null;
    }

    let ndpHdr = ICMP_NDP_HEADER.create({
        targetAddress: query
    }), icmpHdr = ICMP_HEADER.create({
        type: ICMPV6_TYPES.NEIGHBOR_SOLICITATION,
        data: ndpHdr.getBuffer()
    });

    // The actual spec <https://www.rfc-editor.org/rfc/rfc4443#section-2.3>
    let pseudoHdr = IPV6_PSEUDO_HEADER.create({
        saddr: iface.ipv6Address!,
        daddr: new IPV6Address(ALL_LINK_LOCAL_NODES_ADDRESSV6),
        len: icmpHdr.size,
        nextHeader: PROTOCOLS.IPV6_ICMP,
    })

    icmpHdr.set("csum", calculateChecksum(Buffer.concat([
        pseudoHdr.getBuffer(),
        icmpHdr.getBuffer()
    ])));

    let ipv6Hdr = IPV6_HEADER.create({
        saddr: iface.ipv6Address!,
        daddr: new IPV6Address(ALL_LINK_LOCAL_NODES_ADDRESSV6),
        nextHeader: PROTOCOLS.IPV6_ICMP,
        payloadLength: icmpHdr.size,
        payload: icmpHdr.getBuffer()
    })

    // wrap packet in ethernet frame
    return ETHERNET_HEADER.create({
        dmac: BROADCAST_MAC_ADDRESS,
        smac: iface.macAddress,
        ethertype: ETHER_TYPES.IPv6,
        payload: ipv6Hdr.getBuffer()
    })
}