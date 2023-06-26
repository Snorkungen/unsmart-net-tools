import { defineStructType } from "../define";
import { Struct, StructOptions, StructType } from "../struct";

export function STRUCT<ST extends Struct<any>>(struct: ST) {

    // struct value type cannot have a variable size
    // @ts-ignore
    if (struct.order.at(-1) && struct.types[struct.order.at(-1)].bitLength < 0) {
        throw new Error(`cannot create ${STRUCT.name}`)
    }

    return defineStructType<ST>({
        bitLength: struct.getMinBitSize(),
        getter: function (buf: Buffer, options: StructOptions): ST {
            return struct.create(buf, options) as ST;
        },
        setter: function (value: ST, _: StructOptions): Buffer {
            // @ts-ignore
            return value.buffer;
        }
    })
}