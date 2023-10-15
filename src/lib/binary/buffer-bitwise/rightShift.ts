// SOURCE <https://github.com/encendre/bitwise-buffer/blob/master/src/rightShift.js>

export function mutateRightShift(a: Uint8Array, n: number, fillWith = 0) {
    const padding = fillWith ? 0xff : 0x00
    const mod = n & 7 // n % 8
    const div = n >> 3 // Math.floor(n / 8)

    let i = a.length - 1

    while (i - div - 1 >= 0) {
        a[i] = (a[i - div] >> mod) | (a[i - div - 1] << (8 - mod))
        i -= 1
    }

    a[i] = (a[i - div] >> mod) | (padding << (8 - mod))
    i -= 1

    while (i >= 0) {
        a[i] = padding
        i -= 1
    }

    return a
}

export function rightShift(a: Uint8Array, n: number, fillWith = 0) {
    const padding = fillWith ? 0xff : 0x00
    const mod = n & 7 // n % 8
    const div = n >> 3 // Math.floor(n / 8)

    const dest = new Uint8Array(a.length)

    let i = a.length - 1

    while (i - div - 1 >= 0) {
        dest[i] = (a[i - div] >> mod) | (a[i - div - 1] << (8 - mod))
        i -= 1
    }

    dest[i] = (a[i - div] >> mod) | (padding << (8 - mod))
    i -= 1

    while (i >= 0) {
        dest[i] = padding
        i -= 1
    }

    return dest
}
