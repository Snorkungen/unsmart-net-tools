/** Makes buffer to a `number` */
export function _bufToNumber(buf: Uint8Array) {
    let n = 0, i = buf.byteLength;
    while (i > 0) {
        // n += buf[--i] << (i * 8) // little endian
        n += buf[--i] << ((buf.byteLength - 1 - i) * 8) // big endian
    }

    return n;
}