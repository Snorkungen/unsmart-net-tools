import { BaseAddress, defineAddress } from "../base";
import { Buffer } from "buffer";

const DOT_NOTATED_ADDRESS_REGEX = /^(\b25[0-5]|\b2[0-4][0-9]|\b[01]?[0-9][0-9]?)(\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/;

export class IPV4Address implements BaseAddress {
    static ADDRESS_LENGTH: number = 32;
    static parse(input: string): Buffer {
        input = input.trim();
        if (!DOT_NOTATED_ADDRESS_REGEX.test(input)) {
            throw new Error("failed to parse: " + IPV4Address.name);
        }

        let buffer = Buffer.alloc(IPV4Address.ADDRESS_LENGTH / 8);

        input.split(".").forEach((n, i) => {
            buffer[i] = parseInt(n, 10);
        })

        return buffer;
    }
    static validate(input: unknown): boolean {
        if (typeof input == "string") {
            return DOT_NOTATED_ADDRESS_REGEX.test(input);
        }

        return false;
    }

    buffer: Buffer;
    constructor(input: string);
    constructor(input: Buffer);
    constructor(input: IPV4Address);
    constructor(input: unknown) {
        if (typeof input == "string") {
            this.buffer = IPV4Address.parse(input)
        } else if (input instanceof IPV4Address) {
            this.buffer = Buffer.from(input.buffer);
        } else if (input instanceof Uint8Array && (input.length * 8) == IPV4Address.ADDRESS_LENGTH) {
            this.buffer = Buffer.from(input);
        } else {
            throw new Error("failed to initialize: " + IPV4Address.name)
        }
    }

    toString(): string {
        return `${this.buffer[0]}.${this.buffer[1]}.${this.buffer[2]}.${this.buffer[3]}`;
    }
}

export const IPV4_ADDRESS = defineAddress(IPV4Address);