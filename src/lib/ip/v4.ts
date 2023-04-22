import { BitArray } from "../binary";

export class AddressV4 {
    bits: BitArray = new BitArray(0, 32);

    constructor(input: string);
    constructor(input: BitArray);
    constructor(input: unknown) {

        if (typeof input == "string") {
            this.bits = parseDotNotated(input);
        }

        if (input instanceof BitArray && input.size == 32) {
            this.bits = input;
        }
    }

    toString() {
        return dotNotateBitArray(this.bits);
    }
}

export class SubnetMaskV4 {
    bits: BitArray = new BitArray(0, 32);

    constructor(input: string);
    constructor(input: BitArray);
    constructor(input: number);
    constructor(input: unknown) {
        if (typeof input == "string") {
            let bits = parseDotNotated(input);
            if (validateMaskBits(bits)) {
                this.bits = bits
            }
        }

        if (typeof input == "number" && !isNaN(input) && input <= 32 && input >= 0) {
            this.bits.splice(0, input, new BitArray(1, input))
        }

        if (input instanceof BitArray && input.size == 32) {
            if (validateMaskBits(input)) {
                this.bits = input;
            }
        }
    }

    get length() {
        let bitString = this.bits.toString(2)

        for (let i = 0; i < bitString.length; i++) {
            if (bitString[i] == "0") return i;
        }

        return 0;
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
    let broadcastBitArray = netBitArray.xor(new BitArray(1, 32 - mask.length));



    return {
        netAddress: new AddressV4(netBitArray),
        broadcastAddress: new AddressV4(broadcastBitArray)
    }

}


function parseDotNotated(input: string) {
    let bitArray = new BitArray(0, 32);

    // if ()  

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

function validateMaskBits(bits: BitArray) {
    let bitString = bits.toString(2);

    for (let i = 0; i < bitString.length; i++) {
        if (bitString[i] == "0" && bitString.slice(i).includes("1")) {
            return false;
        }
    }

    return true;
}