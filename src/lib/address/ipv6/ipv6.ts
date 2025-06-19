import { BaseAddress } from "../base";
import { createMask } from "../mask";
import { ADDRESS_TYPESV6 } from "./reserved";


export class IPV6Address implements BaseAddress {
    static ADDRESS_LENGTH: number = 128;
    static parse(input: string): Uint8Array {
        input = input.toLowerCase().trim();
        let buffer = new Uint8Array(this.ADDRESS_LENGTH / 8),
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
    static validate(input: unknown): boolean {
        if (typeof input == "string") {
            // lazy it is not a trivial thing to ensure a string is a valid ipv6 address
            let addr = new IPV6Address(input);
            return addr.toString(4) != "::" && input.includes(":")
        }

        return false;
    }

    buffer: Uint8Array;

    constructor(input: string | Uint8Array | IPV6Address) {
        if (typeof input == "string") {
            this.buffer = IPV6Address.parse(input)
        } else if (input instanceof Uint8Array && input.length == IPV6Address.ADDRESS_LENGTH / 8) {
            this.buffer = new Uint8Array(input)
        } else if (input instanceof IPV6Address) {
            this.buffer = new Uint8Array(input.buffer);
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
                // I might create a function that does this 
                // Buffer.toString `a[i] = slice.toString("hex")`   
                a[i] = ""; slice.forEach(n => a[i] += n.toString(16).padStart(2, "0"))
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

    isLinkLocal(): boolean {
        return LINK_LOCAL_MASK.compare(LINK_LOCAL_NET_ADDRESS, this);
    }

    isMulticast(): boolean {
        return MULTICAST_MASK.compare(MULTICAST_NET_ADDRESS, this);
    }
    isLoopback(): boolean {
        return LOOPBACK_MASK.compare(LOOPBACK_NET_ADDRESS, this);
    }

    toJSON(): { type: string; address: string } {
        return {
            type: this.constructor.name,
            address: this.toString(),
        }
    }
}

const LINK_LOCAL_MASK = createMask(IPV6Address, ADDRESS_TYPESV6.LINK_LOCAL[1]), LINK_LOCAL_NET_ADDRESS = new IPV6Address(ADDRESS_TYPESV6.LINK_LOCAL[0]);
const MULTICAST_MASK = createMask(IPV6Address, ADDRESS_TYPESV6.MULTICAST[1]), MULTICAST_NET_ADDRESS = new IPV6Address(ADDRESS_TYPESV6.MULTICAST[0]);
const LOOPBACK_MASK = createMask(IPV6Address, ADDRESS_TYPESV6.LOOPBACK[1]), LOOPBACK_NET_ADDRESS = new IPV6Address(ADDRESS_TYPESV6.LOOPBACK[0]);
