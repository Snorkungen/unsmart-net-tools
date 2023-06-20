import { BitArray } from "../binary";
import { StructValueError, defineStructType, StructType } from "./struct";

function convertLittleEndianToBigEndian(bits: BitArray): BitArray {
    let input = bits.toString(16).match(/.{1,2}/g)?.reverse().join("") || "";
    return new BitArray(0, bits.size).or(new BitArray(input, 16))
}
const convertBigEndianToLittleEndian = convertLittleEndianToBigEndian;

function defineUINT(size: number) {
    return defineStructType<number>({
        size: size,
        setter(v, options) {
            if (v == Infinity) {
                throw new StructValueError("value is infinity", v)
            }
            if (v < 0) {
                throw new StructValueError("value must be positive!", v)
            }
            let bits = new BitArray(0, this.size).or(new BitArray(v));
            if (bits.size > this.size) {
                throw new StructValueError("value does not fit in bits", v)
            }

            if (!options.bigEndian) {
                bits = convertBigEndianToLittleEndian(bits)
            }

            return bits;
        },
        getter(bits, options) {
            if (!options.bigEndian) {
                bits = convertLittleEndianToBigEndian(bits)
            }

            return bits.toNumber()
        }
    })
};

function defineINT(size: number) {
    return defineStructType<number>({
        size,
        setter(v, options) {
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

            if (!options.bigEndian) {
                return convertBigEndianToLittleEndian(bits.or(valBits))
            }

            return bits.or(valBits);

        },
        getter(bits, options) {
            /*
                IMPORTANT this does not work when considering little-endian numbers
            */
            if (!options.bigEndian) {
                bits = convertLittleEndianToBigEndian(bits)
            }

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

export const SLICE = defineStructType({
    defaultValue: new BitArray([]),
    size: -1,
    getter(bits) {
        return bits
    },
    setter(bits) {
        return bits
    }
})