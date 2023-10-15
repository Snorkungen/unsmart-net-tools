// SOURCE <https://github.com/encendre/bitwise-buffer/blob/master/src/or.js>
import { Buffer } from "buffer";

export function mutateOr(a: Uint8Array, b: Uint8Array) {
    let i = Math.max(a.length, b.length)

    while (i--) {
        a[i] |= b[i]
    }

    return a
}

export function or(a: Uint8Array, b: Uint8Array) {
    let i = Math.max(a.length, b.length)

    const dest = new Uint8Array(i);

    while (i--) {
        dest[i] = a[i] | b[i]
    }
    return dest
}