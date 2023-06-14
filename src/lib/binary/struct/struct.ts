import { BitArray } from "../binary"

type StructValueConstructorProps<T> = {
    defaultValue?: T
    size: number
    getter: (bits: BitArray) => T,
    setter: (val: T) => BitArray
}
class StructValue<T> {
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
}

class Struct<const K extends Record<string, StructValue<any>>> {
    values: K
    constructor(values: K) {
 
        this.values = values
    }


}

const UINT8 = new StructValue<number>({
    size: 8,
    setter(v) {
        return new BitArray(0, this.size).or(new BitArray(v))
    },
    getter(bits) {
        return bits.toNumber()
    }
})
const UINT32 = new StructValue<number>({
    size: 32,
    setter(v) {
        return new BitArray(0, this.size).or(new BitArray(v))
    },
    getter(bits) {
        return bits.toNumber()
    }
})
const BOOLEAN = new StructValue<boolean>({
    size: 1,
    setter(v) {
        return new BitArray(v ? 1 : 0)
    },
    getter(bits) {
        return !!bits.toNumber()
    }
})

let struct = new Struct({
    test: UINT8,
    test32: UINT32,
    b: BOOLEAN
})

let g = struct.values.b.get()