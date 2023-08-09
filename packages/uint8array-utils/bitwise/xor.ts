// SOURCE <https://github.com/encendre/bitwise-buffer/blob/master/src/xor.js>

import { alloc } from "../misc"

export function mutateXor(dest: Uint8Array, b: Uint8Array) {
    let i = Math.max(dest.length, b.length)

    while (i--) {
        dest[i] ^= b[i]
    }

    return dest
}

export function xor(a: Uint8Array, b: Uint8Array) {
    let i = Math.max(a.length, b.length)

    const dest = alloc(i);

    while (i--) {
        dest[i] = a[i] ^ b[i]
    }
    return dest
}