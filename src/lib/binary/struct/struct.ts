import { BitArray } from "../binary"

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
}

const STRUCT_DEFAULT_OPTIONS: StructOptions = {
    bigEndian: true,
    setDefaultValues: false,
}

export type StructType<T extends any> = {
    /** value to be set if no value is set when creating an instance of a struct, if not set struct will default to 0*/
    defaultValue?: T;
    /** size of the value type, either the length in bits or bytes depending on what underlying data storage solution */
    size: number | -1;
    /** function to be called when a struct is retrieving a value */
    getter: (bits: BitArray, options: StructOptions) => T;
    /** function to be called when a struct is setting a value */
    setter: (value: T, options: StructOptions) => BitArray;

    /** IDK if this is something worthwhile */
    options?: Partial<StructOptions>
}

export class Struct<Types extends Record<string, StructType<any>>>{
    options: StructOptions;
    order: Array<keyof Types>
    
    private array: BitArray;
    private types: Types;
    private offsetCache: Partial<Record<keyof Types, number>>;

    constructor(types: Types, options: Partial<StructOptions> = {}) {
        let validateError = this.validateTypes(types, options);
        if (validateError instanceof Error) {
            throw validateError;
        }

        this.options = { ...STRUCT_DEFAULT_OPTIONS, ...options };
        this.array = new BitArray(0, this.getMinSize());
        this.order = Object.keys(types)
        this.types = types;
        this.offsetCache = {};

        if (this.options.setDefaultValues) {
            this.setDefaultValues();
        }
    }

    /**
     * RULES: (1) variable length value-types must be the last value.
     * @param types 
     * @param options 
    */
    private validateTypes(types: Types, _: Partial<StructOptions>): Error | null {
        for (let key in types) {
            if (this.types[key].size < 0 && (key != this.order.at(-1))) {
                return new Error("cannot define struct; slice must be last value")
            }
        }

        return null;
    }

    private setDefaultValues() {
        for (let key of this.order) {
            if (this.types[key].defaultValue) {
                this.set(key, this.types[key]!.defaultValue);
            }
        }
    }

    private getTypeOffset<Key extends keyof Types>(key: Key): number {
        if (this.offsetCache[key] != undefined) {
            return this.offsetCache[key]!;
        }

        let offset = 0;

        for (let k of this.order) {
            if (key == k) break;

            let type = this.types[key];
            if (!type) {
                throw new Error("failed to calculate offset")
            }

            offset += type.size;
        }

        this.offsetCache[key] = offset;
        return offset;
    }

    getMinSize(): number {
        let lastType = this.order.at(-1);
        if (!lastType) return 0;
        let offset = this.getTypeOffset(lastType);

        if (this.types[lastType].size < 0) {
            return offset;
        }

        return offset + this.types[lastType].size;
    }

    get bits(): BitArray {
        return this.array;
    }

    set bits(bits: BitArray) {
        if (this.bits.size < this.getMinSize()) {
            throw new Error("cannot set bits, value size mismatch")
        }
        this.array = bits;
    }

    get<Key extends keyof Types>(key: Key): ReturnType<Types[Key]["getter"]> {
        let offset = this.getTypeOffset(key), size = this.types[key].size;
        let bits: BitArray;

        if (size < 0) {
            // value is a slice
            bits = this.bits.slice(offset);
        } else {
            bits = this.bits.slice(offset, offset + size);
        }

        return this.types[key].getter(bits, this.options);
    }

    set<Key extends keyof Types>(key: Key, value: ReturnType<Types[Key]["getter"]> | BitArray) {
        let offset = this.getTypeOffset(key), size = this.types[key].size;
        let bits: BitArray;

        if (value instanceof BitArray) {
            bits = value;
        } else {
            bits = this.types[key].setter(value, this.options);
        }

        // due to the size being variable the deleteCount has to be calculated
        let deleteCount: number;

        if (size < 0) {
            // cheat due to the knowledge that variabel length values MUST always be last
            deleteCount = this.bits.size - offset;
        } else {
            // do a sanity check, check that the bit size is what is expected due to me splicing in bits
            if (bits.size != size) {
                throw new Error("cannot set value, value missmatch");
            }
            deleteCount = size
        }

        this.bits.splice(offset, deleteCount, bits);

        return bits.size;
    }

    create<TypeValues extends { [x in keyof Types]: ReturnType<Types[x]["getter"]> }>(values: Partial<TypeValues> | BitArray, options: Partial<StructOptions> = {}) {
        let struct = new Struct(this.types, { ...this.options, ...options });

        if (values instanceof BitArray) {
            struct.bits = values;
        } else {
            for (let key in values) {
                if (values[key]) struct.set(key, values[key]!);
            }
        }

        return struct;
    }
}

export function defineStruct<Types extends Record<string, StructType<any>>>(input: Types) {
    return new Struct<Types>(input)
}
export function defineStructType<T extends any>(input: StructType<T>) {
    return input
}