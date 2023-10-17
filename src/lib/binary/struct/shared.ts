/** Makes buffer to a `number` */
export function _bufToNumber(buf: Uint8Array) {
    let n = 0, i = buf.byteLength, j = i -1;
        while (i > 0) {
        // n += buf[--i] << (i * 8) // little endian
        n += buf[--i] << ((j - i) * 8) // big endian
    }

    return n;
}
