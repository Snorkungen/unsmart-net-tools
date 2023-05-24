import { BitArray } from "../../binary";
import { validateMaskBits } from "../v4";
import { ADDRESS_TYPESV6 } from "./reserved";

const ADDRESS_LENGTH = 128;



export class AddressV6 {
    static address_length = ADDRESS_LENGTH;
    bits: BitArray = new BitArray(0, ADDRESS_LENGTH);

    constructor(input: string);
    constructor(input: BitArray);
    constructor(input: AddressV6);
    constructor(input: unknown) {

        if (typeof input == "string") {
            this.bits = parseColonNotated(input)
        }

        if (input instanceof BitArray && input.size == ADDRESS_LENGTH) {
            this.bits = input;
        }


        if (input instanceof AddressV6) {
            // copy create new address
            this.bits = input.bits.slice();
        }
    }

    get isMulticast(): boolean {
        return matchAddressTypeV6("MULTICAST", this);
    }
    get isLinkLocal(): boolean {
        return matchAddressTypeV6("LINK_LOCAL", this);
    }

    toString(simplify?: Parameters<typeof colonNotateBitArray>[1]) {
        return colonNotateBitArray(this.bits, simplify)
    }
}

export class SubnetMaskV6 {
    bits: BitArray = new BitArray(0, ADDRESS_LENGTH);

    constructor(input: string);
    constructor(input: BitArray);
    constructor(input: number);
    constructor(input: SubnetMaskV6);
    constructor(input: unknown) {
        if (typeof input == "string") {
            let bits = parseColonNotated(input);
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

        if (input instanceof SubnetMaskV6 && validateMaskBits(input.bits)) {
            this.bits = input.bits.slice();
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

    toString(simplify?: Parameters<typeof colonNotateBitArray>[1]) {
        return colonNotateBitArray(this.bits, simplify)
    }
}

/**
 * I'm unsure as to how ipv6 works so this is exists
 * @param options
 * @returns 
 */
export function calculateSubnetV6({ address, mask }: {
    address: AddressV6,
    mask: SubnetMaskV6
}) {
    let netBitArray = address.bits.and(mask.bits);
    let broadcastBitArray = netBitArray.xor(mask.bits.not());

    // I should probably add some type of shift operations but "I have no clue"
    // changing the last bit
    let minHostBitArray = netBitArray.xor(new BitArray(1));
    let maxHostBitArray = broadcastBitArray.xor(new BitArray(1));


    return {
        address: new AddressV6(address),
        mask: new SubnetMaskV6(mask),

        networkAddress: new AddressV6(netBitArray),
        broadcastAddress: new AddressV6(broadcastBitArray),

        hosts: {
            count: 2 ** (ADDRESS_LENGTH - mask.length) - 2,
            min: new AddressV6(minHostBitArray),
            max: new AddressV6(maxHostBitArray)
        }
    }
}

export function parseColonNotated(input: string) {
    input = input.toLowerCase().trim();

    let bitArray = new BitArray(0, ADDRESS_LENGTH);
    let split = input.split(":");

    for (let i = 0; i < 8; i++) {
        if (!split[i] && split.length != 8) {
            // if undefined fill the array with the correct amount of zeroes
            let missingCount = 8 - split.length;
            split.splice(i, 0,
                ...(new Array<string>(missingCount)
                    .fill((0).toString(16)))
            )
        }
    }

    for (let i = 0; i < 8; i++) {
        bitArray.splice(i * 16, i * 16 + 16,
            new BitArray(0, 16)
                .or(new BitArray(split[i], 16))
        )
    }

    return bitArray;
}


// Validator <http://sqa.fyicenter.com/1000334_IPv6_Address_Validator.html>
/**
 * 
 * @param bitArray 
 * @param simplify '-1' is no simplification
 */
function colonNotateBitArray(bitArray: BitArray, simplify?: -1 | 0 | 4): string;
function colonNotateBitArray(bitArray: BitArray, simplify = 4) {
    let a = new Array<string>(8)

    // in future i'm hopefully planning on simplifying in steps and allow a degree of simplification which would be controlled by a number

    for (let i = 0; i < a.length; i++) {
        let slice = bitArray.slice(i * 16, i * 16 + 16);

        // if simplify is zero or positive remvove leading zeroes
        if (simplify >= 0) {
            a[i] = slice.toString(16)
        } else {
            a[i] = slice.slice(0, 4).toString(16);
            a[i] += slice.slice(4, 8).toString(16);
            a[i] += slice.slice(8, 12).toString(16);
            a[i] += slice.slice(12).toString(16);
        }
    }

    // remove consecutive zeroes
    if (simplify >= 4) {
        type Sequence = [startIndex: number, length: number]
        let sequences = new Array<Sequence>();

        for (let i = 0; i < a.length; i++) {
            if (parseInt(a[i], 16) == 0) {
                let len = 1

                for (let j = i + 1; j < a.length; j++) {
                    if (parseInt(a[j], 16) == 0) {
                        len += 1
                    } else {
                        break;
                    }
                }

                sequences.push([i, len])
                i += len
            }
        }

        if (sequences.length) {
            let longestSequnce: Sequence = sequences[0];
            for (let sequence of sequences) {
                if (longestSequnce[1] < sequence[1]) {
                    longestSequnce = sequence;
                }
            }

            a.splice(longestSequnce[0], longestSequnce[1], (longestSequnce[0] == 0 || longestSequnce[0] + longestSequnce[1] == a.length) ? ":" : "")
        }
    }

    // not so smart bug fix
    if (a.length == 1) {
        return "::"
    }

    return a.join(":")
}

export function matchAddressTypeV6(key: keyof typeof ADDRESS_TYPESV6, address: AddressV6): boolean {
    let [notated, length] = ADDRESS_TYPESV6[key];
    let mask = new SubnetMaskV6(length);
    return address.bits.and(mask.bits).toNumber() == parseColonNotated(notated).toNumber();
} 