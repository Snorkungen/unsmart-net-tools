import { BaseAddress, defineAddress } from "../base";


export class IPV6Address implements BaseAddress {
    static ADDRESS_LENGTH: number = 128;
    static parse(input: string): Buffer {
        input = input.toLowerCase().trim();
        let buffer = Buffer.alloc(this.ADDRESS_LENGTH / 8),
            split = input.split(":");

        for (let i = 0; i < 8; i++) {
            if (!split[i] && split.length != 8) {
                // if undefined fill the array with the correct amount of zeroes
                let missingCount = 8 - split.length;
                split.splice(i, 0,
                    ...(new Array<string>(missingCount).fill("")
                    ))
            }
            split[i] = split[i].padStart(4, "0")
        }

        for (let i = 0; i < 8; i++) {
            buffer[i * 2] = parseInt(split[i].substring(0, 2), 16)
            buffer[i * 2 + 1] = parseInt(split[i].substring(2, 4), 16)
        }

        return buffer;
    }
    buffer: Buffer;

    constructor(input: string);
    constructor(input: Uint8Array);
    constructor(input: IPV6Address);
    constructor(input: unknown) {
        if (typeof input == "string") {
            this.buffer = IPV6Address.parse(input)
        } else if (input instanceof Uint8Array && input.length == IPV6Address.ADDRESS_LENGTH / 8) {
            this.buffer = Buffer.from(input)
        } else if (input instanceof IPV6Address) {
            this.buffer = Buffer.from(input.buffer);
        } else {
            throw new Error("failed to initialize: " + IPV6Address.name)
        }
    }
    /**
     * (-1) No shortening;
     * (0) Remove leading zeroes;
     * (4) remove longest sequence of zeroes;
     * @param simplify 
     */
    toString(simplify: -1 | 0 | 4 = 4): string {
        let a = new Array<string>(8).fill("");

        for (let i = 0; i < a.length; i++) {
            let slice = this.buffer.subarray(i * 2, i * 2 + 2);

            // if simplify is zero or positive remvove leading zeroes
            if (simplify < 0) {
                a[i] = slice.toString("hex")
            } else if (slice[0] == 0) {
                a[i] = slice[1].toString(16)
            } else {
                a[i] = slice[0].toString(16) + slice[1].toString(16).padStart(2, "0")
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
}

export const IPV6_ADDRESS = defineAddress(IPV6Address)