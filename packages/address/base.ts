export class BaseAddress {
    static ADDRESS_LENGTH = 0;
    static parse(input: string): Uint8Array {
        throw new Error("Not Implemented!")
    }

    buffer: Uint8Array;

    constructor(input: Uint8Array) {
        throw new Error("Not Implemented!")
    }

    toString(): string {
        throw new Error("Not Implemented!")
    }
} 
