import { BitArray } from "../../binary";
import { ClassAddressV4, classesV4 } from "./class";

const DOT_NOTATED_ADDRESS_REGEX = /^(\b25[0-5]|\b2[0-4][0-9]|\b[01]?[0-9][0-9]?)(\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/
const ADDRESS_LENGTH = 32;

export class AddressV4 {
    static address_length = ADDRESS_LENGTH;

    bits: BitArray = new BitArray(0, ADDRESS_LENGTH);

    constructor(input: string);
    constructor(input: BitArray);
    constructor(input: AddressV4);
    constructor(input: unknown) {

        if (typeof input == "string") {
            this.bits = parseDotNotated(input);
        }

        if (input instanceof BitArray && input.size == ADDRESS_LENGTH) {
            this.bits = input;
        }

        if (input instanceof AddressV4) {
            // copy create new address
            this.bits = input.bits.slice();
        }
    }

    toString() {
        return dotNotateBitArray(this.bits);
    }

    get class(): ClassAddressV4 {
        for (let c of classesV4) {
            if (c.test(this)) {
                return c;
            }
        }

        throw new Error("classifying address failed");
    }
}

export class SubnetMaskV4 {
    bits: BitArray = new BitArray(0, ADDRESS_LENGTH);

    constructor(input: string);
    constructor(input: BitArray);
    constructor(input: number);
    constructor(input: SubnetMaskV4);
    constructor(input: unknown) {
        if (typeof input == "string") {
            let bits = parseDotNotated(input);
            if (validateMaskBits(bits)) {
                this.bits = bits
            }
        }

        if (typeof input == "number" && !isNaN(input) && input <= ADDRESS_LENGTH && input >= 0) {
            this.bits.splice(0, input, new BitArray(1, input))
        }

        if (input instanceof BitArray && input.size == ADDRESS_LENGTH) {
            if (validateMaskBits(input)) {
                this.bits = input;
            }
        }

        if (input instanceof SubnetMaskV4) {
            // copy create new bits / do not trust anything
            let bits = input.bits.slice();
            if (validateMaskBits(bits)) {
                this.bits = input.bits.slice();
            }
        }
    }

    get length() {
        let bitString = this.bits.toString(2)
        let len = ADDRESS_LENGTH;
        for (let i = 0; i < bitString.length; i++) {
            if (bitString[i] == "0") {
                len = i; break
            }
        }

        return len;
    }

    toString() {
        return dotNotateBitArray(this.bits);
    }
}

export function calculateSubnetV4({ address, mask }: {
    address: AddressV4,
    mask: SubnetMaskV4
}) {
    let netBitArray = address.bits.and(mask.bits);
    let broadcastBitArray = netBitArray.xor(mask.bits.not());

    // I should probably add some type of shift operations but "I have no clue"
    // changing the last bit
    let minHostBitArray = netBitArray.xor(new BitArray(1));
    let maxHostBitArray = broadcastBitArray.xor(new BitArray(1));


    return {
        address: new AddressV4(address),
        mask: new SubnetMaskV4(mask),

        networkAddress: new AddressV4(netBitArray),
        broadcastAddress: new AddressV4(broadcastBitArray),

        hosts: {
            count: 2 ** (ADDRESS_LENGTH - mask.length) - 2,
            min: new AddressV4(minHostBitArray),
            max: new AddressV4(maxHostBitArray)
        }
    }
}

function parseDotNotated(input: string) {
    let bitArray = new BitArray(0, ADDRESS_LENGTH);
    input = input.trim()
    // this should not probly be done here
    if (!DOT_NOTATED_ADDRESS_REGEX.test(input)) return bitArray;
    // This looks cool & all but this is so abstracted i have no clue what's going on below
    input.split(".").forEach((n, i) => {
        bitArray.splice(i * 8, i * 8 + 8,
            new BitArray(0, 8)
                .or(new BitArray(Number(n)))
        )
    });

    return bitArray;
}

function dotNotateBitArray(bits: BitArray) {
    return [
        bits.slice(0, 8).toString(10),
        bits.slice(8, 16).toString(10),
        bits.slice(16, 24).toString(10),
        bits.slice(24).toString(10)
    ].join(".");
}

export function validateMaskBits(bits: BitArray) {
    let bitString = bits.toString(2);

    for (let i = 0; i < bitString.length; i++) {
        if (bitString[i] == "0" && bitString.slice(i).includes("1")) {
            return false;
        }
    }

    return true;
}

export function validateDotNotated(input: string) {
    return DOT_NOTATED_ADDRESS_REGEX.test(input.trim())
}