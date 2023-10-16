

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