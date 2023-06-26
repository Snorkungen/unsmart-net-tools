import { defineStructType } from "./define";
import { StructType } from "./struct";

type ExtractStructType<T extends StructType<any>> = ReturnType<T["getter"]>
type StructArrayType<T extends StructType<any>> = ExtractStructType<T>[]

export function ARRAY<T extends StructType<any>, L extends number>(sType: T, size: L) {

    // just to simplify life sType's bitLength MUST be a multiple of 8
    if (sType.bitLength % 8  != 0) {
        throw new Error("Cannot create ARRAY")
    }

    return defineStructType<StructArrayType<T>>({
        bitLength: sType.bitLength * size,
        getter(buf, options) {
            let values = new Array(size);

            for (let i = 0; i < values.length; i++) {
                values[i] = sType.getter(buf.subarray(i * (sType.bitLength / 8), (i + 1) * (sType.bitLength / 8)), options)
            }

            return values;
        },
        setter(value, options) {
            let buf = Buffer.alloc(this.bitLength / 8);

            for (let i = 0; i < value.length; i++) {
                let b = sType.setter(value[i], options);
                buf.set(b, i * b.length)
            }

            return buf;
        },
    })
}