/**
 * REFERENCE: feross - buffer - <https://github.com/feross/buffer/blob/master/index.js>
 * 
 * 
 */

/**
 * This function checks if the arrays are equal
 * @param a `Uint8Array`
 * @param b `Uint8Array`
 */
export function uint8_equals(a: Uint8Array, b: Uint8Array): boolean {
    if (a.byteLength != b.byteLength) {
        return false;
    }

    for (let i = 0; i < a.byteLength; i++) {
        if (a[i] != b[i]) {
            return false;
        }
    }

    return true;
}

export function uint8_mutateSet(target: Uint8Array, source: Uint8Array, offset: number = 0): Uint8Array {
    let i = 0;
    while (offset < target.byteLength && i < source.byteLength) {
        target[offset++] = source[i++];
    }

    return target;
}

export function uint8_set(target: Uint8Array, source: Uint8Array, offset: number = 0): Uint8Array {
    return uint8_mutateSet(new Uint8Array(target), source, offset);
}

export function uint8_concat(list: readonly Uint8Array[]): Uint8Array {
    let totalLength = list.reduce((sum, { byteLength }) => sum + byteLength, 0);

    let buffer = new Uint8Array(totalLength);

    let i = 0, offset = 0;

    while (i < list.length) {
        uint8_mutateSet(buffer, list[i], offset)
        offset += list[i].byteLength;

        i++;
    }

    return buffer;
}

/** Source <https://stackoverflow.com/a/65227338> */
export function uint8_fromNumber(n: number, len: number = 1): Uint8Array {
    let buf = new Uint8Array(len);
    if (!n) return buf

    const a = []
    a.unshift(n & 255)
    while (n >= 256) {
        n = n >>> 8
        a.unshift(n & 255)
    }

    let aBuf = new Uint8Array(a);

    let diff = buf.length - aBuf.length;

    if (diff < 0) {
        if (typeof len == "number") {
            console.warn(n + ": does not fit in specified size")
            return buf;
        } else return aBuf;
    }

    buf.set(aBuf, diff)
    return buf;
}

export function uint8_fill(target: Uint8Array, value: number): Uint8Array {
    value = value & 0xff;

    let i = target.byteLength;
    while (i-- > 0) { target[i] = value }

    return target;
}

export function uint8_readUint32BE(source: Uint8Array, offset = 0) {
    offset = offset >>> 0; // make positive
    return (source[offset] * 0x1000000) +
        ((source[offset + 1] << 16) | (source[offset + 2] << 8) | source[offset + 3])
}

export function uint8_readUint16BE(source: Uint8Array, offset = 0) {
    offset = offset >>> 0; // make positive
    return (source[offset] << 8)
        + (source[offset + 1])
}

export function uint8_readUint32LE(source: Uint8Array, offset = 0) {
    offset = offset >>> 0; // make positive
    return ((source[offset]) |
        (source[offset + 1] << 8) |
        (source[offset + 2] << 16)) +
        (source[offset + 3] * 0x1000000)
}

export function uint8_readUint16LE(source: Uint8Array, offset = 0) {
    offset = offset >>> 0; // make positive
    return (source[offset + 1] << 8)
        | (source[offset])
}

export function uint8_fromString(str: string): Uint8Array {
    let encoder = new TextEncoder();
    return encoder.encode(str)
}

export function uint8_matchLength(buffer1: Uint8Array, buffer2: Uint8Array): number {
    let length = 0;
    for (let i = 0; i < buffer1.byteLength && i < buffer2.byteLength; i++) {
        if (buffer1[i] == buffer2[i]) {
            length += 8;
        } else {
            let b1 = buffer1[i], b2 = buffer2[i];
            if ((b1 & 0xfe) == (b2 & 0xfe)) return length + 7;
            if ((b1 & 0xfc) == (b2 & 0xfc)) return length + 6;
            if ((b1 & 0xf8) == (b2 & 0xf8)) return length + 5;
            if ((b1 & 0xf0) == (b2 & 0xf0)) return length + 4;
            if ((b1 & 0xe0) == (b2 & 0xe0)) return length + 3;
            if ((b1 & 0xc0) == (b2 & 0xc0)) return length + 2;
            if ((b1 & 0x80) == (b2 & 0x80)) return length + 1;

            return length;
        }
    }

    return length;
}