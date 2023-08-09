"use strict";
// SOURCE <https://github.com/encendre/bitwise-buffer/blob/master/src/rightShift.js>
Object.defineProperty(exports, "__esModule", { value: true });
exports.rightShift = exports.mutateRightShift = void 0;
const misc_1 = require("../misc");
function mutateRightShift(dest, n, fillWith = 0) {
    const padding = fillWith ? 0xff : 0x00;
    const mod = n & 7; // n % 8
    const div = n >> 3; // Math.floor(n / 8)
    let i = dest.length - 1;
    while (i - div - 1 >= 0) {
        dest[i] = (dest[i - div] >> mod) | (dest[i - div - 1] << (8 - mod));
        i -= 1;
    }
    dest[i] = (dest[i - div] >> mod) | (padding << (8 - mod));
    i -= 1;
    while (i >= 0) {
        dest[i] = padding;
        i -= 1;
    }
    return dest;
}
exports.mutateRightShift = mutateRightShift;
function rightShift(a, n, fillWith = 0) {
    const padding = fillWith ? 0xff : 0x00;
    const mod = n & 7; // n % 8
    const div = n >> 3; // Math.floor(n / 8)
    const dest = (0, misc_1.alloc)(a.length);
    let i = a.length - 1;
    while (i - div - 1 >= 0) {
        dest[i] = (a[i - div] >> mod) | (a[i - div - 1] << (8 - mod));
        i -= 1;
    }
    dest[i] = (a[i - div] >> mod) | (padding << (8 - mod));
    i -= 1;
    while (i >= 0) {
        dest[i] = padding;
        i -= 1;
    }
    return dest;
}
exports.rightShift = rightShift;
