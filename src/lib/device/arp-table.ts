// inspo <https://www.auvik.com/franklyit/blog/what-is-an-arp-table/>

import { BitArray } from "../binary";
import { EthernetFrame, MACAddress } from "../ethernet";
import { ARPPacket, OPCODES } from "../ethernet/arp";
import { ETHER_TYPES } from "../ethernet/types";
import { AddressV4 } from "../ip/v4"
import { Host } from "./host";
import { Interface } from "./interface";

type TableEntry = {
    neighbour: AddressV4;
    address: MACAddress;
    created: number; // timestamp to calculate age of entry // for default to ignore this entry
    iface: Interface;
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

export const ARP_QUERY_ERRORS = {
    TIMEOUT: "ARP QUERY TIMED OUT!"
} as const;

export class ARPTable {
    table: Array<TableEntry> = [];

    constructor(private host: Host, private timeout = 100) {

        // Here i should create an interval that then deletes old arp entries

    }

    get(query: AddressV4): TableEntry {
        return this.table.filter((entry) => {
            return entry.neighbour.toString() == query.toString()
        })[0];
    }

    async getSend(query: AddressV4) {
        let entry = this.get(query);

        if (entry) {
            return entry;
        }

        return new Promise<TableEntry>((resolve, reject) => {
            let indices: Array<number> = []
            for (let iface of this.host.interfaces) {
                let f = createARPRequest(query, iface)
                if (f) {
                    indices.push(
                        this.host.statefulSend(f, (frame, iface) => {
                            let arpPacket = new ARPPacket(frame.payload);
                            this.add(new AddressV4(arpPacket.targetProtocol), new MACAddress(arpPacket.targetHardware), iface)
                            // clean up
                            indices.forEach(sidx => this.host.statefulClose(sidx))
                            resolve(this.get(query)!)
                        })
                        )
                    }
                }
                setTimeout(() => {
                // clean up
                indices.forEach(sidx => this.host.statefulClose(sidx))
                reject(ARP_QUERY_ERRORS.TIMEOUT)
            }, this.timeout);
        })
    }

    add(neighbour: AddressV4, address: MACAddress, iface: Interface) {
        this.table.push({
            neighbour,
            address,
            created: Date.now(),
            iface
        });
    }
}