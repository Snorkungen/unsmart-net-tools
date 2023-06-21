// SOURCE <https://github.com/encendre/bitwise-buffer/blob/master/src/and.js>

export function mutateAnd(a: Buffer, b: Buffer) {
    let i = Math.max(a.length, b.length)

    while (i--) {
        a[i] &= b[i]
    }

    return a
}

export function and(a: Buffer, b: Buffer) {
    let i = Math.max(a.length, b.length)

    const dest = Buffer.allocUnsafe(i)

    while (i--) {
        dest[i] = a[i] & b[i]
    }
    return dest
}