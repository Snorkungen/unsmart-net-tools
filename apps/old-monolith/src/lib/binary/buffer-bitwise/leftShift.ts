// SOURCE <https://github.com/encendre/bitwise-buffer/blob/master/src/leftShift.js>
import { Buffer } from "buffer";

export function mutateLeftShift(a: Buffer, n: number, fillWith = 0) {
    const padding = fillWith ? 0xff : 0x00
    const mod = n & 7 // n % 8
    const div = n >> 3 // Math.floor(n / 8)

    let i = 0

    while (i + div + 1 < a.length) {
        a[i] = (a[i + div] << mod) | (a[i + div + 1] >> (8 - mod))
        i += 1
    }

    a[i] = (a[i + div] << mod) | (padding >> (8 - mod))
    i += 1

    while (i < a.length) {
        a[i] = padding
        i += 1
    }

    return a
}

export function leftShift(a: Buffer, n: number, fillWith = 0) {
    const padding = fillWith ? 0xff : 0x00
    const mod = n & 7 // n % 8
    const div = n >> 3 // Math.floor(n / 8)

    const dest = Buffer.allocUnsafe(a.length)

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
