import { BitArray } from "./bit-array";

// SOURCE <https://datatracker.ietf.org/doc/html/rfc4648#section-4>
const TABLE = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I',
    'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R',
    'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'a',
    'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j',
    'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's',
    't', 'u', 'v', 'w', 'x', 'y', 'z', '0', '1',
    '2', '3', '4', '5', '6', '7', '8', '9', '+',
    '/'
] as const;
const PADDING = '=';
const EMPTY_SEXTET = new BitArray(0, 6);

export function base64_encode(bits: BitArray): string {
    let str = "";
    let i = 0;

    // i have no clue what I'm doing
    // an attempt at padding bits to be a multiple of 6
    let rest = bits.size % 6;
    if (rest > 0) {
        bits = bits.concat(new BitArray(0, 6 - rest))
    }

    while (i < bits.size) {
        let b = bits.slice(i, i + EMPTY_SEXTET.size);


        let n = b.toNumber();

        str += TABLE[n]

        i += EMPTY_SEXTET.size;
    }

    rest = str.length % 4;
    if (rest > 0) {
        str += "".padEnd(4 - rest, PADDING)
    }

    return str
}

export function base64_decode(str: string): BitArray {
    let bits: BitArray | null = null;
    for (let char of str) {
        if (char == PADDING) {
            break;
        }

        let i = TABLE.indexOf(char as typeof TABLE[number]);
        if (i == -1) {
            throw new Error(`"${char}" is not a valid character`)
        };

        if (bits) {
            bits.splice(bits.size, 0, EMPTY_SEXTET.or(new BitArray(i)))
        } else {
            bits = EMPTY_SEXTET.or(new BitArray(i));
        }
    }

    if (!bits) {
        throw new Error("failed to decode.")
    }

    // chop off extra bits
    let rest = bits.size % 8;
    bits.splice(bits.size - rest, rest);

    return bits;
}