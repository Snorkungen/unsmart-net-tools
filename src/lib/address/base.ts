import { Buffer } from "buffer";

export class BaseAddress {
    static ADDRESS_LENGTH = 0;
    static parse(input: string): Buffer {
        throw new Error("Not Implemented!")
    }

    buffer: Buffer;

    constructor(input: Buffer) {
        throw new Error("Not Implemented!")
    }

    toString(): string {
        throw new Error("Not Implemented!")
    }
} 
