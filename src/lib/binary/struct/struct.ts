import { mutateAnd, mutateLeftShift, mutateNot, mutateOr, mutateRightShift } from "../buffer-bitwise";

export class StructValueError extends Error {
    constructor(message: string, public value: unknown) {
        super(`cannot set; ${message}`);
    }
}

export type StructOptions = {
    /** big endian is true by default if false it will be assumed that littleEndian is true */
    bigEndian: boolean;
    /** by default is false, if true sets the value of a type ie. that's defined in "defaultValue" */
    setDefaultValues: boolean;
    /** by default is true, if true the struct will fit the values into as few bytes as possible */
    packed: boolean;
}

const STRUCT_DEFAULT_OPTIONS: StructOptions = {
    bigEndian: true,
    setDefaultValues: false,
    packed: true
}

export type StructType<T extends any> = {
    /** value to be set if no value is set when creating an instance of a struct, if not set struct will default to 0*/
    defaultValue?: T;
    /** bitLength of the value type, determines how many bits the value  contain */
    bitLength: number | -1;
    /** function to be called when a struct is retrieving a value */
    getter: (buf: Buffer, options: StructOptions) => T;
    /** function to be called when a struct is setting a value */
    setter: (value: T, options: StructOptions) => Buffer;
}

export class Struct<Types extends Record<string, StructType<any>>>{
    order: Array<keyof Types>

    private options: StructOptions;
    private buffer: Buffer;
    private types: Types;
    private offsetCache: Partial<Record<keyof Types, number>>;

    constructor(types: Types, options: Partial<StructOptions> = {}) {
        this.options = { ...STRUCT_DEFAULT_OPTIONS, ...options };
        this.order = Object.keys(types)
        this.types = types;
        this.offsetCache = {};

        let validateError = this.validateTypes();
        if (validateError instanceof Error) {
            throw validateError;
        }

        this.buffer = Buffer.alloc(this.getMinSize());

        if (this.options.setDefaultValues) {
            this.setDefaultValues();
        }
    }

    /**
     * RULES: (1) total bitLength MUST be a multiple of 8. (2) variable length value-types MUST be the last value.
     * @param types 
     * @param options 
    */
    private validateTypes(): Error | null {

        for (let key in this.types) {
            if (this.types[key].bitLength < 0 && (key != this.order.at(-1))) {
                return new Error("cannot define struct; slice must be last value")
            }
        }

        if (this.getMinBitSize() % 8 !== 0) {
            return new Error("cannot define struct; total bitLength MUST be a multiple of 8")
        }

        return null;
    }

    /**
     * @param key 
     * @returns the bit offset for value-type
     */
    private getTypeBitOffset<Key extends keyof Types>(key: Key): number {
        if (this.offsetCache[key] != undefined) {
            return this.offsetCache[key]!;
        }

        let offset = 0;

        for (let k of this.order) {
            if (key == k) break;

            if (!this.types[k]) {
                throw new Error("failed to calculate offset")
            }

            if (this.options.packed) {
                offset += this.types[k].bitLength;
            } else {
                // set offset to nearest multiple of 8;
                offset += Math.ceil(this.types[k].bitLength / 8) * 8;
            }
        }
        this.offsetCache[key] = offset;
        return offset;
    }

    private setDefaultValues() {
        for (let key in this.order) {
            if (this.types[key].defaultValue === undefined) {
                continue
            }
            this.set(key, this.types[key].defaultValue);
        }
    }

    getMinBitSize(): number {
        let lastType = this.order.at(-1);
        if (!lastType) return 0;

        let bitOffset = this.getTypeBitOffset(lastType);
        if (this.types[lastType].bitLength < 0) {
            return bitOffset;
        }

        return bitOffset + this.types[lastType].bitLength;
    }

    getMinSize(): number {
        return Math.ceil(this.getMinBitSize() / 8);
    }

    private createMask(
        size: number,
        firstByteBitOffset: number,
        lastByteBitOffset: number
    ): Buffer {
        let mask = Buffer.alloc(size);

        // calculate first byte bit offset
        if (firstByteBitOffset > 0) {
            mask[0] = (2 ** firstByteBitOffset) - 1 << 8 - firstByteBitOffset;
        }

        if (lastByteBitOffset > 0) {
            mask[mask.length - 1] = mask[mask.length - 1] | (2 ** lastByteBitOffset) - 1;
        }

        return mask;
    }

    get<Key extends keyof Types>(key: Key): ReturnType<Types[Key]["getter"]> {
        let bitOffset = this.getTypeBitOffset(key), bitLength = this.types[key].bitLength;
        let buf: Buffer;

        let startIndex = Math.floor(bitOffset / 8);
        let endIndex = Math.ceil((bitOffset + bitLength) / 8);

        if (bitLength < 0) {
            buf = this.buffer.subarray(startIndex);
        } else {
            buf = this.buffer.subarray(startIndex, endIndex);
        }

        if (!this.options.bigEndian) {
            // reverse the byte order
            buf = buf.reverse()
        }
        
        if (this.options.packed && bitLength >= 0) {
            buf = Buffer.from(buf)

            let firstByteBitOffset = bitOffset - (startIndex * 8)
            let lastByteBitOffset = (endIndex * 8) - (startIndex * 8) - firstByteBitOffset - bitLength;
            let mask = this.createMask(buf.length, firstByteBitOffset, lastByteBitOffset);

            mutateNot(mask)
            mutateAnd(buf, mask);
            mutateRightShift(buf, lastByteBitOffset)
        }
        return this.types[key].getter(buf, this.options);
    }

    set<Key extends keyof Types>(key: Key, value: ReturnType<Types[Key]["getter"]> | Buffer) {
        let bitOffset = this.getTypeBitOffset(key), bitLength = this.types[key].bitLength;
        let buf: Buffer;

        if (value instanceof Buffer) {
            buf = value;
        } else {
            buf = this.types[key].setter(value, this.options);
        }

        if (bitLength > 0 && (buf.length > Math.ceil(bitLength / 8) || parseInt(buf.toString("hex"), 16) >= 2 ** bitLength)) {
            console.log(key, bitLength)
            throw new StructValueError("value does not fit in bits", value)
        }

        if (!this.options.bigEndian && !(value instanceof Buffer)) {
            // reverse the byte order
            buf = buf.reverse()
        }

        let startIndex = Math.floor(bitOffset / 8), endIndex = Math.ceil((bitOffset + bitLength) / 8);
        if (this.options.packed && bitLength >= 0) {

            let prevBuf = this.buffer.subarray(startIndex, endIndex)

            let firstByteBitOffset = bitOffset - (startIndex * 8)
            let lastByteBitOffset = (endIndex * 8) - (startIndex * 8) - firstByteBitOffset - bitLength;
            let mask = this.createMask(buf.length, firstByteBitOffset, lastByteBitOffset);

            mutateAnd(mask, prevBuf);
            mutateLeftShift(buf, lastByteBitOffset);
            mutateOr(buf, mask)
        }

        if (bitLength < 0) {
            let newBuf = Buffer.alloc(this.getMinSize() + buf.length);
            this.buffer.copy(newBuf);
            this.buffer = newBuf;
        }

        this.buffer.set(buf, startIndex);
    }

    create<TypeValues extends { [x in keyof Types]: ReturnType<Types[x]["getter"]> }>(values: Partial<TypeValues> | Buffer, options: Partial<StructOptions> = {}) {
        let struct = new Struct(this.types, { ...this.options, ...options });

        if (values instanceof Buffer) {
            struct.buffer = values;
        } else {
            for (let key in values) {
                if (values[key]) struct.set(key, values[key]!);
            }
        }

        return struct;
    }
}
