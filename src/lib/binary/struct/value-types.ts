import { StructValueError } from "./struct";
import { defineStructType } from "./define";
import { uint8_fromNumber } from "../uint8-array";
import { _bufToNumber } from "./shared";



function defineUINT(bitLength: number) {
    return defineStructType<number>({
        bitLength: bitLength,
        setter(v, options) {
            if (v == Infinity) {
                throw new StructValueError("value is infinity", v)
            }
            if (v < 0) {
                throw new StructValueError("value must be positive!", v)
            }
            if (v >= 2 ** this.bitLength) {
                throw new StructValueError("value does not fit in bits", v)
            }

            return uint8_fromNumber(v, Math.ceil(this.bitLength / 8));
        },
        getter(buf, options) {
            if (this.bitLength == 32) {
                let n = _bufToNumber(buf)
                let mask = 0x80000000;
                if (n < 0) {
                    return (n ^ mask) + mask;
                }
                return n;
            }
            return _bufToNumber(buf)
        }
    })
};

function defineINT(bitLength: number) {
    return defineStructType<number>({
        bitLength: bitLength,
        setter(v, options) {
            if (v == Infinity) {
                throw new StructValueError("value is infinity", v)
            }

            let signedBitValue: 0 | 1 = 0;

            if (v < 0) {
                v *= -1;
                signedBitValue = 1;
            }

            let valBuf = uint8_fromNumber(v, Math.ceil(this.bitLength / 8));

            if (v >= 2 ** (this.bitLength - 1)) {
                throw new StructValueError("value does not fit in bits", v)
            }

            if (signedBitValue == 1) {
                valBuf[0] = valBuf[0] | 0x80;
            }

            return valBuf;
        },
        getter(buf, options) {
            let mod = 1;
            if (buf[0] & 0x80) {
                buf[0] = buf[0] ^ 0x80;
                mod = -1;
            }

            return _bufToNumber(buf) * mod;
        }
    })
};

export const UINT8 = defineUINT(8);
export const UINT16 = defineUINT(16);
export const UINT32 = defineUINT(32);
// export const UINT64 = `StructType<BigInt>` !TODO implement BigInt

export const INT8 = defineINT(8);
export const INT16 = defineINT(16);
export const INT32 = defineINT(32);
// export const INT64 = `StructType<BigInt>` !TODO implement BigInt

export const SLICE = defineStructType<Uint8Array>({
    defaultValue: new Uint8Array(0),
    bitLength: -1,
    getter(buf) {
        return buf
    },
    setter(buf) {
        return buf
    },
    endianSensitive: true,
})

export const BYTE_ARRAY = (length: number) => defineStructType<Uint8Array>({
    defaultValue: new Uint8Array(length),
    bitLength: length * 8,
    getter: buf => buf,
    setter: buf => buf,
    endianSensitive: true,
})