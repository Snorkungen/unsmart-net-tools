import { BitArray } from "../binary"


type StructOptions = {
    byteOrder: "BIG" | "LITTLE";
}

const STRUCT_DEFAULT_OPTIONS: StructOptions = {
    byteOrder: "BIG",
}

export type StructValueConstructorProps<T> = {
    defaultValue?: T
    size: number
    getter: (bits: BitArray) => T,
    setter: (val: T) => BitArray
};
export class StructValue<T> {
    bits: BitArray;

    private getter: StructValueConstructorProps<T>["getter"];
    private setter: StructValueConstructorProps<T>["setter"];
    private size: number;

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
        this.options = Object.assign(options ?? {}, STRUCT_DEFAULT_OPTIONS);

        this.bits = new BitArray(0, size);
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

        if (this.options.byteOrder == "LITTLE") {
            let input = bits.toString(16).match(/.{1,2}/g)?.reverse().join("") || "";
            bits = new BitArray(0, this.size).or(new BitArray(input, 16))
        }

        return this.getter(bits);
    }

    set(val: T): void {
        this.bits = this.setter(val);
    }

    create(val: T): StructValue<T> {
        return new StructValue({
            defaultValue: val,
            size: this.size,
            getter: this.getter,
            setter: this.setter,
        })
    }

    setOption<K extends keyof StructOptions>(key: K, value: StructOptions[K]) {
        this.options[key] = value;

    }
}

export class Struct<K extends Record<string, StructValue<any> | Struct<any>>> {
    private order: Array<keyof K>;
    public values: K;

    private options: StructOptions

    constructor(values: K, options?: Partial<StructOptions>) {
        this.values = values;
        this.order = Object.keys(values)

        // Configure options
        this.options = Object.assign(options ?? {}, STRUCT_DEFAULT_OPTIONS);
    }

    get bits() {
        let bits: BitArray = new BitArray([]);;
        for (let key of this.order) {
            let val = this.values[key];
            bits.splice(bits.size, 0, val.bits)
        }

        return bits;
    }

    private set bits(bits: BitArray) {
        if (bits.size != this.bits.size) {
            throw new Error("Bits does not match struct")
        }

        let offset = 0;
        for (let key of this.order) {
            let val = this.values[key], size = val.bits.size;;

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

            if (struct.values[key].bits.size != values[key]!.bits.size) {
                throw new Error("value mismatch, cannot set value")
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
    }
}

export function defineStruct<K extends Record<string, StructValue<any> | Struct<any>>>(input: K) {
    return new Struct<K>(input)
}
