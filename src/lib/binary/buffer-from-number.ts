import { Buffer } from "buffer";
import { mutateOr } from "./buffer-bitwise/or";

/** Source <https://stackoverflow.com/a/65227338> */
export function bufferFromNumber  (n: number, len = 1): Buffer {
    let buf = Buffer.alloc(len);
    if (!n) return buf;
    const a = []
    a.unshift(n & 255)
    while (n >= 256) {
        n = n >>> 8
        a.unshift(n & 255)
    }
    return mutateOr(buf, Buffer.from(a));
}