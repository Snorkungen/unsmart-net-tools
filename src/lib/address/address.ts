import { StructType } from "../binary/struct"

export const defineAddress = <AT extends typeof BaseAddress>(Address: AT) => {
    return <StructType<InstanceType<AT>>>{
        bitLength: Address.ADDRESS_LENGTH,
        getter(buffer) {
            return <InstanceType<AT>>(new Address(buffer))
        },
        setter(value) {
            return value.buffer;
        },
    }
}

export class BaseAddress {
    static ADDRESS_LENGTH = 0;

    buffer: Buffer;

    constructor(input: Buffer) {
        throw new Error("Not Implemented!")
    }

    toString(): string {
        throw new Error("Not Implemented!")
    }

    static parse(input: string): Buffer {
        throw new Error("Not Implemented!")
    }
} 
