// SOURCE <https://github.com/encendre/bitwise-buffer/blob/master/src/nor.js>

export function mutateNor(a: Buffer, b: Buffer) {
    let i = Math.max(a.length, b.length)

    while (i--) {
        a[i] = ~(a[i] | b[i])
    }

    return a
}

export function nor(a: Buffer, b: Buffer) {
    let i = Math.max(a.length, b.length)

    const dest = Buffer.allocUnsafe(i)

    while (i--) {
        dest[i] = ~(a[i] | b[i])
    }
    return dest
}
