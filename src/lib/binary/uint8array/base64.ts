/**
 * Source:
 *  RFC 4648 - The Base16, Base32, and Base64 Data Encodings - <https://www.rfc-editor.org/rfc/rfc4648.html>
 * 
 */

/**
 * Table 2: The "URL and Filename safe" Base 64 Alphabet
 */
const ALPHABET = [
    'A', 'B', 'C', 'D', 'E', 'F',
    'G', 'H', 'I', 'J', 'K', 'L',
    'M', 'N', 'O', 'P', 'Q', 'R',
    'S', 'T', 'U', 'V', 'W', 'X',
    'Y', 'Z', 'a', 'b', 'c', 'd',
    'e', 'f', 'g', 'h', 'i', 'j',
    'k', 'l', 'm', 'n', 'o', 'p',
    'q', 'r', 's', 't', 'u', 'v',
    'w', 'x', 'y', 'z', '0', '1',
    '2', '3', '4', '5', '6', '7',
    '8', '9', '+', '/'
];

const PAD = "="

export function uint8_toBase64(buffer: Uint8Array): string {
    let arr = [];
    let padCount = 0;

    // read three octets
    for (let i = 0; i < buffer.byteLength; i += 3) {
        let octets = buffer.subarray(i, i + 3);
        if (octets.byteLength < 3) {
            padCount = 3 - octets.byteLength;

            let tmp = new Uint8Array(3);
            tmp.set(octets);
            octets = tmp

        }

        arr.push(
            ALPHABET[(octets[0] & 0xfc) >> 2],
            ALPHABET[((octets[0] & 0x03) << 4) + ((octets[1] & 0xf0) >> 4)],
            ALPHABET[((octets[1] & 0x0f) << 2) + ((octets[2] & 0xcf) >> 6)],
            ALPHABET[octets[2] & 0x3f]
        )
    }

    if (!!padCount) {
        for (let j = arr.length - padCount; j < arr.length; j++) {
            arr[j] = PAD
        }
    }

    return arr.join("");
}

export function uint8_fromBase64(value: string): Uint8Array {
    // calculate final length
    let len = Math.ceil(
        value.length / 4
    );

    let buffer = new Uint8Array(len * 3);
    let padCount = 0;


    for (let i = 0; i < len; i++) {
        let chars = value.slice(i * 4, i * 4 + 4).split("").map((v) => {
            if (v == PAD) { padCount++; return 0 };

            let n = ALPHABET.indexOf(v);

            if (n < 0 && v != PAD) {
                throw new Error(v + " is invalid")
            }
            return n;
        });


        let bi = i * 3
        buffer[bi++] = (chars[0] << 2) | ((chars[1]) >> 4);
        buffer[bi++] = ((chars[1] & 0x0f) << 4) | (chars[2] >> 2);
        buffer[bi++] = chars[2] << 6 | chars[3]
    }
    return buffer.subarray(0, buffer.byteLength - padCount);
}
