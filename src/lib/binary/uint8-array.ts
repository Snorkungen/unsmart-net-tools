

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