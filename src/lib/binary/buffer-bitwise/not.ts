// SOURCE <https://github.com/encendre/bitwise-buffer/blob/master/src/not.js>
import { Buffer } from "buffer";

export function mutateNot(dest: Buffer) {
    let i = dest.length

    while (i--) {
        dest[i] = ~dest[i]
    }

    return dest
}

export function not(buff: Buffer) {
    let i = buff.length
    const dest = Buffer.allocUnsafe(i)

    while (i--) {
        dest[i] = ~buff[i]
    }

    return dest
}