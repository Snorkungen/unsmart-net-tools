// inspo <https://www.auvik.com/franklyit/blog/what-is-an-arp-table/>

import { MACAddress } from "../ethernet";
import { AddressV4 } from "../ip/v4"

type TableEntry = {
    neighbour: AddressV4;
    address: MACAddress;
    created: number; // timestamp to calculate age of entry // for default to ignore this entry
    ifID: number;
}

export class ARPTable {
    table: Array<TableEntry> = [];

    get(query: AddressV4): TableEntry[] {
        return this.table.filter((entry) => entry.address.toString() == query.toString());
    }

    add(neighbour: AddressV4, address: MACAddress, ifID: number) {
        this.table.push({
            neighbour,
            address,
            created: Date.now(),
            ifID
        })
    }
}