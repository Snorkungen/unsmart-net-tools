// Bitwise operations
// https://www.w3schools.com/js/js_bitwise.asp

class Byte {
    value: number = 0;
    constructor(input?: unknown) {
        if (typeof input == "number" && !isNaN(input) && input <= 255 && input >= 0) {
            // ensure number is 8 bits
            this.value = input;
        }

        // default to zero
    }

    toString(radix?: number | undefined) {
        return this.value.toString(radix)
    }
}

type AddressValue = [Byte, Byte, Byte, Byte]
export class Address {
    value: AddressValue = [new Byte(), new Byte(), new Byte(), new Byte()];

    get bits() {
        let bits = ""
        for (let byte of this.value) {
            let b = byte.toString(2);

            while (b.length < 8) {
                b = "0" + b
            }
            bits += b;
        }

        return bits
    }

    constructor(input: unknown) {

        if (typeof input == "string") {
            input = input.split(".").map(s => new Byte(Number(s)))
        }

        if (Array.isArray(input) && input.length == 4) {
            if (input.every(b => b instanceof Byte)) {
                this.value = input as AddressValue;
            }

        }

    }

    toString() {
        return this.value.join(".")
    }
}

export class SubnetMask {
    value: AddressValue = [new Byte(), new Byte(), new Byte(), new Byte()];
    get bits() {
        let bits = ""
        for (let byte of this.value) {
            let b = byte.toString(2);

            while (b.length < 8) {
                b = "0" + b
            }
            bits += b;
        }

        return bits
    }
    constructor(input: unknown) {
        if (typeof input == "number" && !isNaN(input) && input <= 32 && input >= 0) {
            let bits = "";
            let i = 0;
            while (bits.length < 32) {
                if (input > i) {
                    bits += "1"
                } else {
                    bits += "0"
                }
                i++
            }

            input = [bits.slice(0, 8), bits.slice(8, 16), bits.slice(16, 24), bits.slice(24, 32)].map((str) => new Byte(parseInt(str, 2)))
        }

        // tries to parse dot notation 10.0.0.1
        if (typeof input == "string") {
            input = input.split(".").map(s => new Byte(Number(s)))
        }

        if (Array.isArray(input) && input.length == 4) {
            let bool = false;

            for (let i = 0; i < input.length; i++) {
                let b = input[i]
                if (!(b instanceof Byte)) break;

                let bits = b.toString(2);

                for (let j = 0; j < bits.length; j++) {
                    let n = bits[j];
                    if (n === "0" && bits.slice(j).includes("1")) {
                        // if invalid
                        i = input.length;
                        break;
                    }
                }

                if (i == input.length - 1) {
                    bool = true
                }
            }

            if (bool) {
                this.value = input as AddressValue;
            }
        }

    }


    get length() {
        let len = 0;

        for (let b of this.value) {
            let bits = b.toString(2);

            if (bits.includes("0")) {
                // count "1"s
                len += bits.split("").reduce((sum, v) => {
                    if (v == "1") return sum + 1;
                    else return sum;
                }, 0)
            } else {
                len += bits.length;
            }
        }

        return len;
    }

    toString() {
        return dotNotateBits(this.bits)
    }
}

function dotNotateBits(bits: string) {
    let nums: Array<number> = []
    let numCount = 4;
    let bitCount = bits.length / 4;

    for (let i = 0; i < numCount; i++) {
        nums[i] = parseInt(bits.slice(bitCount * i, bitCount * i + bitCount), 2)
    }

    return nums.join(".")
}

type CalculateSubnetOptions = {
    address: Address,
    mask: SubnetMask
}

export function calculateSubnet({ address, mask }: CalculateSubnetOptions) {
    let netBits = address.bits.slice(0, mask.length) + createString("0", address.bits.length - mask.length);
    let broadcastBits = address.bits.slice(0, mask.length) + createString("1", address.bits.length - mask.length);

    // replace last bit
    let minHostBits = netBits.slice(0, -1) + "1",
        maxHostBits = broadcastBits.slice(0, -1) + "0";

    let m = calculateAppropriateMask(40)
    console.log(m.length, m.toString())

    return {
        address: address,
        networkAddress: new Address(dotNotateBits(netBits)),
        broadcastAddress: new Address(dotNotateBits(broadcastBits)),

        hosts: {
            count: 2 ** (32 - mask.length) - 2,
            min: new Address(dotNotateBits(minHostBits)),
            max: new Address(dotNotateBits(maxHostBits))
        },


        mask: mask
    }
}

function createString(char: string, len: number) {
    return new Array(len).fill(char).join("");
}


function calculateAppropriateMask(hostCount: number) {
    let length = 32 - Math.sqrt(hostCount + 2) - 1;
    return new SubnetMask(length);
}