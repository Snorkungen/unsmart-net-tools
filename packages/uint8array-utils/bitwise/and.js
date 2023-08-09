"use strict";
// SOURCE <https://github.com/encendre/bitwise-buffer/blob/master/src/and.js>
Object.defineProperty(exports, "__esModule", { value: true });
exports.and = exports.mutateAnd = void 0;
const misc_1 = require("../misc");
function mutateAnd(dest, b) {
    let i = Math.max(dest.length, b.length);
    while (i--) {
        dest[i] &= b[i];
    }
    return dest;
}
exports.mutateAnd = mutateAnd;
function and(a, b) {
    let i = Math.max(a.length, b.length);
    const dest = (0, misc_1.alloc)(i);
    while (i--) {
        dest[i] = a[i] & b[i];
    }
    return dest;
}
exports.and = and;
