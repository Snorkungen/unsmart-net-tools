import { BitArray } from "../binary";
import { MACAddress } from "./mac";
import { ETHER_TYPES } from "./types";
import { VLANTag } from "./vlan";

// 802.3 Ethernet packet and frame structure <https://en.wikipedia.org/wiki/Ethernet_frame>
// this thing does not have a crc i can't be bothered extra complexity

export class Ethertype {
    static address_length = 16;
    bits = new BitArray(0, Ethertype.address_length);

    constructor(input: number | BitArray | Ethertype) {
        if (typeof input == "number" && (input < 0 || input > 2 ** Ethertype.address_length)) {
            // invalid input
            return;
        }

        if (input instanceof BitArray) {
            this.bits = this.bits.or(input).slice(0, Ethertype.address_length)
            return
        }

        if (input instanceof Ethertype) {
            this.bits = input.bits.slice();
            return;
        }

        this.bits = this.bits.or(new BitArray(input))
    }

    get value(): number {
        return this.bits.toNumber();
    }

    get name(): string | null {
        let v = this.value;
        let type = ETHER_TYPES.find(([val]) => !!val && val == v);

        if (type) {
            return type[1];
        }

        return null
    }

}

export class EthernetFrame {

    bits: BitArray;

    constructor(destination: MACAddress, source: MACAddress, tol: Ethertype, payload: BitArray)
    constructor(destination: MACAddress, source: MACAddress, vlanTag: VLANTag, tol: Ethertype, payload: BitArray) // with vlan
    constructor(destination: MACAddress, source: MACAddress, ...rest: (VLANTag | Ethertype | BitArray)[]) {
        // add destination and source address
        this.bits = destination.bits.concat(source.bits)

        // jank code
        for (let i = 0; i < rest.length; i++) {
            let val = rest[i]
            if (i < 2 && val instanceof Ethertype) {
                this.bits = this.bits.concat(val.bits)
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

    get source(): MACAddress {
        return new MACAddress(this.bits.slice(MACAddress.address_length, MACAddress.address_length * 2));
    }

    get type(): Ethertype {
        let ethertype = new Ethertype(
            this.bits.slice(MACAddress.address_length * 2, MACAddress.address_length * 2 + Ethertype.address_length)
        );

        // check if vlan tag and move pointer my ass this is the greatest language
        if (ethertype.value == VLANTag.TPID.toNumber()) {
            ethertype = new Ethertype(this.bits.slice(MACAddress.address_length * 2 + VLANTag.address_length, MACAddress.address_length * 2 + VLANTag.address_length + Ethertype.address_length));
        }

        return ethertype;
    }

    get vlan(): VLANTag | null {
        let ethertype = new Ethertype(
            this.bits.slice(MACAddress.address_length * 2, MACAddress.address_length * 2 + Ethertype.address_length)
        );

        if (ethertype.value != VLANTag.TPID.toNumber()) {
            return null;
        }

        return new VLANTag(this.bits.slice(MACAddress.address_length * 2, MACAddress.address_length * 2 + VLANTag.address_length))
    }

    get payload(): BitArray {
        if (this.vlan) {
            return this.bits.slice(MACAddress.address_length * 2 + VLANTag.address_length);
        }
        return this.bits.slice(MACAddress.address_length * 2 + Ethertype.address_length);
    }
}