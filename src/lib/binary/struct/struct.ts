import { BitArray } from "../binary"

export type StructValueConstructorProps<T> = {
    defaultValue?: T
    size: number
    getter: (bits: BitArray) => T,
    setter: (val: T) => BitArray
}
export class StructValue<T> {
    bits: BitArray;

    private getter: StructValueConstructorProps<T>["getter"];
    private setter: StructValueConstructorProps<T>["setter"];

    constructor({
        defaultValue,
        size,

        getter,
        setter

    }: StructValueConstructorProps<T>) {
        this.getter = getter;
        this.setter = setter;

        this.bits = new BitArray(0, size);
        if (defaultValue) {
            this.set(defaultValue);
        }
    }

    get(): T {
        return this.getter(this.bits);
    }

    set(val: T): void {
        this.bits = this.setter(val);
    }

    create(val: T): StructValue<T> {
        return new StructValue({
            defaultValue: val,
            size: this.bits.size,
            getter: this.getter,
            setter: this.setter,
        })
    }
}

export class Struct<const K extends Record<string, StructValue<any> | Struct<any>>> {
    private order: Array<keyof K>;
    public values: K;

    constructor(values: K) {
        this.values = values;
        this.order = Object.keys(values)
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
        for (let key in this.order) {
            let val = this.values[key], size = val.bits.size;;

            this.values[key].bits = bits.slice(offset, offset + size);

            offset += size;
        }
    }


    create(values: Partial<{ [x in keyof K]: K[x] }>) {
        let struct = new Struct(this.values);

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
}

export const UINT8 = new StructValue<number>({
    size: 8,
    setter(v) {
        return new BitArray(0, this.size).or(new BitArray(v))
    },
    getter(bits) {
        return bits.toNumber()
    }
})
export const UINT16 = new StructValue<number>({
    size: 16,
    setter(v) {
        return new BitArray(0, this.size).or(new BitArray(v))
    },
    getter(bits) {
        return bits.toNumber()
    }
})
export const UINT32 = new StructValue<number>({
    size: 32,
    setter(v) {
        return new BitArray(0, this.size).or(new BitArray(v))
    },
    getter(bits) {
        return bits.toNumber()
    }
})
export const BOOLEAN = new StructValue<boolean>({
    size: 1,
    setter(v) {
        return new BitArray(v ? 1 : 0)
    },
    getter(bits) {
        return !!bits.toNumber()
    }
})


export function defineStruct<const K extends Record<string, StructValue<any> | Struct<any>>>(input: K) {
    return new Struct<K>(input)
}
