import { BitArray } from "../binary";
import { StructValue } from "./struct";

export class StructValueError extends Error {
    constructor(message: string, public value: unknown) {
        super(`cannot set; ${message}`);
    }
}

function defineUINT(size: number): StructValue<number> {
    return new StructValue<number>({
        size: size,
        setter(v) {
            if (v == Infinity) {
                throw new StructValueError("value is infinity", v)
            }
            if (v < 0) {
                throw new StructValueError("value must be positive!", v)
            }
            let valBits = new BitArray(v);
            if (valBits.size > this.size) {
                throw new StructValueError("value does not fit in bits", v)
            }
            return new BitArray(0, this.size).or(valBits);
        },
        getter(bits) {
            return bits.toNumber()
        }
    })
};

function defineINT(size: number): StructValue<number> {
    return new StructValue<number>({
        size,
        setter(v) {
            let signedBitValue: 0 | 1 = 0;

            if (v < 0) {
                v *= -1;
                signedBitValue = 1;
            }

            if (v == Infinity) {
                throw new StructValueError("value is infinity", v)
            }

            let valBits = new BitArray(v);
            if (valBits.size > this.size - 1) {
                throw new StructValueError("value does not fit in bits", v)
            }

            let bits = new BitArray(0, this.size);
            // set signed bit
            bits.splice(0, 1, new BitArray(signedBitValue));
            return bits.or(valBits);

        },
        getter(bits) {
            /*
                IMPORTANT this does not work when considering little-endian numbers
            */

            let val = bits.slice(1).toNumber()
            let signedBitValue: 0 | 1 = bits.slice(0, 1).toString(2) == "0" ? 0 : 1;
            if (signedBitValue == 0) return val;
            else return val * -1;
        },
    })
}

export const UINT8 = defineUINT(8);
export const UINT16 = defineUINT(16);
export const UINT32 = defineUINT(32);
export const UINT64 = defineUINT(64);

export const INT8 = defineINT(8);
export const INT16 = defineINT(16);
export const INT32 = defineINT(32);
export const INT64 = defineINT(64);

export const BOOLEAN = new StructValue<boolean>({
    size: 1,
    setter(v) {
        return new BitArray(v ? 1 : 0)
    },
    getter(bits) {
        return !!bits.toNumber()
    }
})