import { BitArray } from "../binary";
import { MACAddress } from "./mac";
import { ETHER_TYPES, EtherType } from "./types";
import { VLANTag } from "./vlan";

// 802.3 Ethernet packet and frame structure <https://en.wikipedia.org/wiki/Ethernet_frame>
// this thing does not have a crc i can't be bothered extra complexity

const ETHERTYPE_BITS = new BitArray(0, 16)

export class EthernetFrame {

    bits: BitArray;

    constructor(destination: MACAddress, source: MACAddress, tol: EtherType, payload: BitArray)
    constructor(destination: MACAddress, source: MACAddress, vlanTag: VLANTag, tol: EtherType, payload: BitArray) // with vlan
    constructor(destination: MACAddress, source: MACAddress, ...rest: (VLANTag | EtherType | BitArray)[]) {
        // add destination and source address
        this.bits = destination.bits.concat(source.bits)

        // jank code
        for (let i = 0; i < rest.length; i++) {
            let val = rest[i]
            if (i < 2 && typeof val == "number") {
                this.bits = this.bits.concat(ETHERTYPE_BITS.or(new BitArray(val)))
            } else if (i == 0 && val instanceof VLANTag) {
                this.bits = this.bits.concat(val.bits)
            } else if (i > 0 && val instanceof BitArray) {
                this.bits = this.bits.concat(val)
            }
        }
    }


    get destination(): MACAddress {
        return new MACAddress(this.bits.slice(0, MACAddress.address_length));
    }

    set destination(address: MACAddress) {
        this.bits.splice(0, MACAddress.address_length, address.bits);
    }

    get source(): MACAddress {
        return new MACAddress(this.bits.slice(MACAddress.address_length, MACAddress.address_length * 2));
    }

    set source(address: MACAddress) {
        this.bits.splice(MACAddress.address_length, MACAddress.address_length, address.bits);
    }


    get type(): EtherType {
        let ethertype = this.bits.slice(MACAddress.address_length * 2, MACAddress.address_length * 2 + ETHERTYPE_BITS.size).toNumber()

        // check if vlan tag and move pointer my ass this is the greatest language
        if (ethertype == ETHER_TYPES.VLAN) {
            ethertype = this.bits.slice(MACAddress.address_length * 2 + VLANTag.address_length, MACAddress.address_length * 2 + VLANTag.address_length + ETHERTYPE_BITS.size).toNumber();
        }

        return ethertype as EtherType;
    }

    get vlan(): VLANTag | null {
        let ethertype = this.bits.slice(MACAddress.address_length * 2, MACAddress.address_length * 2 + ETHERTYPE_BITS.size).toNumber()
        if (ethertype != ETHER_TYPES.VLAN) {
            return null;
        }

        return new VLANTag(this.bits.slice(MACAddress.address_length * 2, MACAddress.address_length * 2 + VLANTag.address_length))
    }

    set vlan(vlan: VLANTag | null) {
        if (this.vlan && vlan) {
            // edit vlan        
            this.bits.splice(MACAddress.address_length * 2, VLANTag.address_length, vlan.bits);
        } else if (!this.vlan && vlan) {
            this.bits.splice(MACAddress.address_length * 2, 0, vlan.bits);
            // add vlan
        } else if (this.vlan && !vlan) {
            // remove vlan
            this.bits.splice(MACAddress.address_length * 2, VLANTag.address_length);
        }
    }

    get payload(): BitArray {
        if (this.vlan) {
            return this.bits.slice(MACAddress.address_length * 2 + VLANTag.address_length);
        }
        return this.bits.slice(MACAddress.address_length * 2 + ETHERTYPE_BITS.size);
    }
}