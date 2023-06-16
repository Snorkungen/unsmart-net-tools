import { BitArray } from "../binary"

export class StructValueError extends Error {
    constructor(message: string, public value: unknown) {
        super(`cannot set; ${message}`);
    }
}

export type StructOptions = {
    byteOrder: "BIG" | "LITTLE";
}

const STRUCT_DEFAULT_OPTIONS: StructOptions = {
    byteOrder: "BIG",
}

export type StructValueConstructorProps<T> = {
    defaultValue?: T
    size: number
    getter: (bits: BitArray, options: StructOptions) => T,
    setter: (val: T, options: StructOptions) => BitArray
};
export class StructValue<T> {
    bits: BitArray;
    size: number;

    private getter: StructValueConstructorProps<T>["getter"];
    private setter: StructValueConstructorProps<T>["setter"];

    private options: StructOptions

    constructor({
        defaultValue,
        size,

        getter,
        setter,
    }: StructValueConstructorProps<T>, options?: Partial<StructOptions>) {
        this.getter = getter;
        this.setter = setter;
        this.size = size;

        // Configure options
        this.options = {
            ...STRUCT_DEFAULT_OPTIONS,
            ...(options || {}),
        };

        if (this.size < 0) {
            this.bits = new BitArray([]);
        } else {
            this.bits = new BitArray(0, this.size);
        }

        if (defaultValue) {
            this.set(defaultValue);
        }
    }

    get value(): T {
        return this.get()
    }
    set value(val: T) {
        this.set(val);
    }

    get(): T {
        let bits = this.bits;
        return this.getter(bits, this.options);
    }

    set(val: T): void {
        this.bits = this.setter(val, this.options);
    }

    create(val: T): StructValue<T> {
        return new StructValue({
            defaultValue: val,
            size: this.size,
            getter: this.getter,
            setter: this.setter,
        }, this.options)
    }

    clone(): StructValue<T> {
        return new StructValue<T>({
            defaultValue: this.get(),
            size: this.size,
            getter: this.getter,
            setter: this.setter,
        }, this.options)
    }

    setOption<K extends keyof StructOptions>(key: K, value: StructOptions[K]) {
        this.options[key] = value;
        return this;
    }
}

export class Struct<K extends Record<string, StructValue<any>>> {
    private order: Array<keyof K>;
    public values: K;

    private options: StructOptions;

    constructor(values: K, options?: Partial<StructOptions>) {
        // loop through values and the value to new bitArray
        this.values = values;
        this.order = Object.keys(values)

        for (let key of this.order) {
            if ((this.values[key] as StructValue<unknown>).size < 0) {
                if (key != this.order.at(-1)) {
                    throw new Error("cannot define struct; slice must be last value")
                }
            }

            (this.values[key] as any) = this.values[key].clone();
        }

        // Configure options
        this.options = { ...STRUCT_DEFAULT_OPTIONS };

        // Configure options of values
        if (!options) return;
        for (let k in options) {
            if (!options[k as keyof StructOptions]) {
                continue
            }
            this.setOption(k as keyof StructOptions, options[k as keyof StructOptions] as unknown as any)
        }
    }

    /** return the minimum size of the struct */
    get size(): number {
        let size = 0;
        for (let key of this.order) {
            let val = this.values[key];
            if (val.size < 0) {
                break;
            }
            size += val.size;
        }
        return size;
    }

    get bits() {
        let bits: BitArray = new BitArray([]);
        for (let key of this.order) {
            let val = this.values[key];
            bits.splice(bits.size, 0, val.bits)
        }

        return bits;
    }

    private set bits(bits: BitArray) {
        if (bits.size < this.bits.size) {
            throw new Error("Bits does not match struct")
        }

        let offset = 0;
        for (let key of this.order) {
            let val = this.values[key], size = val.size;

            if (size < 0) {
                this.values[key].bits = bits.slice(offset);
                return;
            }

            this.values[key].bits = bits.slice(offset, offset + size);
            offset += size;
        }
    }

    create(values: Partial<{ [x in keyof K]: K[x] }> | BitArray, options?: Partial<StructOptions>) {
        let struct = new Struct(this.values, options);

        if (values instanceof BitArray) {
            struct.bits = values;
            return struct;
        }

        for (let key in values) {
            if (!values[key]) {
                continue
            }

            if (struct.values[key].size < 0) {

            } else if (struct.values[key].bits.size != values[key]!.bits.size) {
                throw new StructValueError("value mismatch", values[key])
            }

            struct.values[key].bits = values[key]!.bits
        }

        return struct
    }

    setOption<K extends keyof StructOptions>(key: K, value: StructOptions[K]) {
        this.options[key] = value;
        for (let vkey of this.order) {
            this.values[vkey].setOption(key, value);
        }
        return this;
    }
}

export function defineStruct<K extends Record<string, StructValue<any>>>(input: K) {
    return new Struct<K>(input)
}
