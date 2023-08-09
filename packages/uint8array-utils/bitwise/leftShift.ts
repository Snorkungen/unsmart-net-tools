// SOURCE <https://github.com/encendre/bitwise-buffer/blob/master/src/leftShift.js>

import { alloc } from "../misc"

export function mutateLeftShift(dest: Uint8Array, n: number, fillWith = 0): Uint8Array {
    const padding = fillWith ? 0xff : 0x00
    const mod = n & 7 // n % 8
    const div = n >> 3 // Math.floor(n / 8)

    let i = 0

    while (i + div + 1 < dest.length) {
        dest[i] = (dest[i + div] << mod) | (dest[i + div + 1] >> (8 - mod))
        i += 1
    }

    dest[i] = (dest[i + div] << mod) | (padding >> (8 - mod))
    i += 1

    while (i < dest.length) {
        dest[i] = padding
        i += 1
    }

    return dest; 
}

export function leftShift(a: Uint8Array, n: number, fillWith = 0): Uint8Array {
    const padding = fillWith ? 0xff : 0x00
    const mod = n & 7 // n % 8
    const div = n >> 3 // Math.floor(n / 8)

    const dest = alloc(a.length);

    let i = 0

    while (i + div + 1 < a.length) {
        dest[i] = (a[i + div] << mod) | (a[i + div + 1] >> (8 - mod))
        i += 1
    }

    dest[i] = (a[i + div] << mod) | (padding >> (8 - mod))
    i += 1

    while (i < a.length) {
        dest[i] = padding
        i += 1
    }

    return dest
}
