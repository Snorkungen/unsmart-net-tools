import { Buffer } from "buffer";
import { mutateOr } from "./buffer-bitwise/or";

/** Source <https://stackoverflow.com/a/65227338> */
export function bufferFromNumber(n: number, len?: number): Buffer {
    let l = len || 1;
    let buf = Buffer.alloc(l);
    if (!n) return buf;

    const a = []
    a.unshift(n & 255)
    while (n >= 256) {
        n = n >>> 8
        a.unshift(n & 255)
    }

    let aBuf = Buffer.from(a);

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