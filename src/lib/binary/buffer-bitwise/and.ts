// SOURCE <https://github.com/encendre/bitwise-buffer/blob/master/src/and.js>

export function mutateAnd(a: Uint8Array, b: Uint8Array) {
    let i = Math.max(a.length, b.length)

    while (i--) {
        a[i] &= b[i]
    }

    return a
}

export function and(a: Uint8Array, b: Uint8Array) {
    let i = Math.max(a.length, b.length)

    const dest = new Uint8Array(i)

    while (i--) {
        dest[i] = a[i] & b[i]
    }
    return dest
}