import { Struct, StructOptions, StructType } from "./struct";

export class CreateStructTypeError extends Error {
    constructor(public f: Function, cause: string) {
        super(`operation failed for ${f.name}. Cause; ${cause}`);
        this.cause = cause;
    }
}

export type ExtractStructType<T extends StructType<any>> = ReturnType<T["getter"]>;
export type StructArrayType<T extends StructType<any>> = ExtractStructType<T>[];

export function ARRAY<T extends StructType<any>, L extends number>(sType: T, size: L): StructType<StructArrayType<T>> {

    // just to simplify life sType's bitLength MUST be a multiple of 8
    if (sType.bitLength % 8 != 0) {
        throw new CreateStructTypeError(ARRAY, "Cannot create an 'array type' with a bitLength that is not a multiple of 8")
    }

    return <StructType<StructArrayType<T>>>{
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
    }
}

export function STRUCT<ST extends Struct<any>>(struct: ST): StructType<ST> {
    // struct value type cannot have a variable size
    // @ts-ignore
    if (struct.order.at(-1) && struct.types[struct.order.at(-1)].bitLength < 0) {
        throw new CreateStructTypeError(STRUCT, "Cannot create an 'struct type' with a struct that has a variable length")
    }

    return <StructType<ST>>{
        bitLength: struct.getMinBitSize(),
        getter: function (buf: Buffer, options: StructOptions): ST {
            return struct.create(buf, options) as ST;
        },
        setter: function (value: ST, _: StructOptions): Buffer {
            return value.getBuffer();
        }
    }
}