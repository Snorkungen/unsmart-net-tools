"use strict";
// SOURCE <https://github.com/encendre/bitwise-buffer/blob/master/src/or.js>
Object.defineProperty(exports, "__esModule", { value: true });
exports.or = exports.mutateOr = void 0;
const misc_1 = require("../misc");
function mutateOr(dest, b) {
    let i = Math.max(dest.length, b.length);
    while (i--) {
        dest[i] |= b[i];
    }
    return dest;
}
exports.mutateOr = mutateOr;
function or(a, b) {
    let i = Math.max(a.length, b.length);
    const dest = (0, misc_1.alloc)(i);
    while (i--) {
        dest[i] = a[i] | b[i];
    }
    return dest;
}
exports.or = or;
