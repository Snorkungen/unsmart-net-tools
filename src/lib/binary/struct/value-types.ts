import { StructValueError } from "./struct";
import { defineStructType } from "./define";
import { Buffer } from "buffer";
import { uint8_fromNumber } from "../uint8-array";

/** Makes buffer to a `number` */
function bufToNumber(buf: Uint8Array) {
    let n = 0, i = buf.byteLength;
    while (i > 0) {
        // n += buf[--i] << (i * 8) // little endian
        n += buf[--i] << ((buf.byteLength - 1 - i) * 8) // big endian
    }

    return n;
}

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

            return Buffer.from(
                uint8_fromNumber(v, Math.ceil(this.bitLength / 8))
            )
        },
        getter(buf, options) {
            return bufToNumber(buf)
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

            let valBuf = Buffer.from(
                uint8_fromNumber(v, Math.ceil(this.bitLength / 8))
            );

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

            return bufToNumber(buf) * mod;
        }
    })
};

export const UINT8 = defineUINT(8);
export const UINT16 = defineUINT(16);
export const UINT32 = defineUINT(32);
export const UINT64 = defineUINT(64);

export const INT8 = defineINT(8);
export const INT16 = defineINT(16);
export const INT32 = defineINT(32);
export const INT64 = defineINT(64);

export const SLICE = defineStructType<Buffer>({
    defaultValue: Buffer.alloc(0),
    bitLength: -1,
    getter(buf) {
        return buf
    },
    setter(buf) {
        return buf
    }
})

export const BYTE_ARRAY = (length: number) => defineStructType<Buffer>({
    defaultValue: Buffer.alloc(length),
    bitLength: length * 8,
    getter: buf => buf,
    setter: buf => buf
})