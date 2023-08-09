"use strict";
// SOURCE <https://github.com/encendre/bitwise-buffer/blob/master/src/not.js>
Object.defineProperty(exports, "__esModule", { value: true });
exports.not = exports.mutateNot = void 0;
const misc_1 = require("../misc");
function mutateNot(dest) {
    let i = dest.length;
    while (i--) {
        dest[i] = ~dest[i];
    }
    return dest;
}
exports.mutateNot = mutateNot;
function not(buff) {
    let i = buff.length;
    const dest = (0, misc_1.alloc)(i);
    while (i--) {
        dest[i] = ~buff[i];
    }
    return dest;
}
exports.not = not;
