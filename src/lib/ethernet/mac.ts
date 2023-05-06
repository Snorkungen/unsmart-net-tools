import { BitArray } from "../binary";

const POSSIBLE_SEPARATOR = ["-", ":", "."] as const;
const SEPARATOR_REGEX = new RegExp(`[${POSSIBLE_SEPARATOR.join("")}]`, "ig");

export class MACAddress {
    static address_length = 48;

    bits: BitArray = new BitArray(0, MACAddress.address_length);

    constructor(input: string);
    constructor(input: BitArray);
    constructor(input: MACAddress);
    constructor(input: unknown) {

        if (typeof input == "string") {
            this.bits = parseMACAddressString(input);
        } else if (input instanceof BitArray && input.size == MACAddress.address_length) {
            this.bits = input.slice();
        } else if (input instanceof MACAddress) {
            this.bits = input.bits.slice();
        }

    }

    get isLocal(): boolean {
        // 7th bit
        let ulBit = this.bits.slice(6, 7)
        return ulBit.toNumber() == 1;
    }

    get isUniversal(): boolean {
        return !this.isLocal;
    }

    get isBroadcast(): boolean {
        // all bits are 1
        return this.bits.not().toNumber() == 0;
    }

    get isUnicast(): boolean {
        // 8th bit
        let igBit = this.bits.slice(7, 8)
        return igBit.toNumber() == 0;
    }

    get isMulticast(): boolean {
        // do not know if a broadcast address is a multicast adress will assume it is.
        return !this.isUnicast;
    }

    toString(separator: typeof POSSIBLE_SEPARATOR[number] = "-") {
        let octets = new Array<string>(6);

        for (let i = 0; i < octets.length; i++) {
            let slice = this.bits.slice(i * 8, i * 8 + 8);

            octets[i] = slice.slice(0, 4).toString(16);
            octets[i] += slice.slice(4).toString(16);
        }

        return octets.join(separator);
    }
}



function parseMACAddressString(input: string) {
    let bitArray = new BitArray(0, MACAddress.address_length);
    // remove separators 
    input = input.replaceAll(SEPARATOR_REGEX, "");

    let n = parseInt(input, 16);
    return bitArray.or(new BitArray(n));
}