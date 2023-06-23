import { StructValueError, defineStructType } from ".";

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

            return Buffer.from(v.toString(16).padStart(Math.ceil(this.bitLength / 8) * 2, "0"), "hex");
        },
        getter(buf, options) {
            return parseInt(buf.toString("hex"), 16)
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

            let valBuf = Buffer.from(v.toString(16).padStart(Math.ceil(this.bitLength / 8) * 2, "0"), "hex");

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

            return parseInt(buf.toString("hex"), 16) * mod;
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