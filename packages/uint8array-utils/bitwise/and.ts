// SOURCE <https://github.com/encendre/bitwise-buffer/blob/master/src/and.js>

import { alloc } from "../misc"

export function mutateAnd(dest: Uint8Array, b: Uint8Array): Uint8Array {
    let i = Math.max(dest.length, b.length)

    while (i--) {
        dest[i] &= b[i]
    }

    return dest;
}

export function and(a: Uint8Array, b: Uint8Array): Uint8Array {
    let i = Math.max(a.length, b.length)

    const dest = alloc(i);

    while (i--) {
        dest[i] = a[i] & b[i]
    }
    return dest
}