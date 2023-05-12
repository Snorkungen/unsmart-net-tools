// inspo <https://www.auvik.com/franklyit/blog/what-is-an-arp-table/>

import { BitArray } from "../binary";
import { EthernetFrame, MACAddress } from "../ethernet";
import { ARPPacket, OPCODES } from "../ethernet/arp";
import { ETHER_TYPES } from "../ethernet/types";
import { AddressV4 } from "../ip/v4"
import { Device } from "./device";
import { Interface } from "./interface";

type TableEntry = {
    neighbour: AddressV4;
    address: MACAddress;
    created: number; // timestamp to calculate age of entry // for default to ignore this entry
    iface: Interface;
}

function sendARPRequest(query: AddressV4, iface: Interface) {
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
    let ethernetFrame = new EthernetFrame(new MACAddress(new BitArray(1, MACAddress.address_length)), iface.macAddress, ETHER_TYPES.ARP, arpPacket.bits)
    iface.send(ethernetFrame)
    // true means no problems as of what it knows
    return true;
}

export const ARP_QUERY_ERRORS = {
    TIMEOUT: 0
}

export class ARPTable {
    table: Array<TableEntry> = [];
    sent = new Array<[AddressV4, ...((val: TableEntry) => void)[]]>();

    constructor(private device: Device, private timeout = 100) {

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
            let idx = this.sent.findIndex(([addr]) => addr.toString() == query.toString())
            if (idx >= 0) {
                this.sent[idx].push(resolve)
            } else {
                this.sent.push([query, resolve])
            }
            for (let iface of this.device.interfaces) {
                sendARPRequest(query, iface)
            }
            setTimeout(() => {
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

        let idx = this.sent.findIndex(([addr]) => addr.toString() == neighbour.toString())
        if (idx >= 0) {
            let entry = this.get(neighbour);
            if (!entry) {
                return
            }
            for (let cb of this.sent[idx].slice(1) as Array<((e: TableEntry) => void)>) {
                cb(entry)
            }
            delete this.sent[idx];
        }
    }
}