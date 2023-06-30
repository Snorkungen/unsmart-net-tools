// SOURCE <https://github.com/encendre/bitwise-buffer/blob/master/src/xor.js>
import { Buffer } from "buffer";

export function mutateXor(a: Buffer, b: Buffer) {
    let i = Math.max(a.length, b.length)

    while (i--) {
        a[i] ^= b[i]
    }

    return a
}

export function xor(a: Buffer, b: Buffer) {
    let i = Math.max(a.length, b.length)

    const dest = Buffer.allocUnsafe(i)

    while (i--) {
        dest[i] = a[i] ^ b[i]
    }
    return dest
}