export class BaseAddress {
    static ADDRESS_LENGTH = 0;
    static parse(input: string): Uint8Array {
        throw new Error("Not Implemented!")
    }

    buffer: Uint8Array;

    constructor(input: Uint8Array | string) {
        if (typeof input == "string") {
            throw new Error("lying to tsc")
        }
        this.buffer = input;
    }

    toString(): string {
        throw new Error("Not Implemented!")
    }

    toJSON(): { type: string; address: string } {
        throw new Error("Not Implemented!")
    }
}