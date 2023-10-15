// SOURCE <https://github.com/encendre/bitwise-buffer/blob/master/src/not.js>

export function mutateNot(dest: Uint8Array) {
    let i = dest.length

    while (i--) {
        dest[i] = ~dest[i]
    }

    return dest
}

export function not(buff: Uint8Array) {
    let i = buff.length
    const dest = new Uint8Array(i);

    while (i--) {
        dest[i] = ~buff[i]
    }

    return dest
}