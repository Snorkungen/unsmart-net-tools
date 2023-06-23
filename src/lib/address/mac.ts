import { BaseAddress, defineAddress } from "./address";

const POSSIBLE_SEPARATOR = ["-", ":", "."] as const;
const SEPARATOR_REGEX = new RegExp(`[${POSSIBLE_SEPARATOR.join("")}]`, "ig");

export class MACAddress implements BaseAddress {
    static ADDRESS_LENGTH = 48;
    static parse(input: string): Buffer {
        let buffer = Buffer.alloc(MACAddress.ADDRESS_LENGTH / 8);
        // remove separators 
        input = input.replaceAll(SEPARATOR_REGEX, "").trim();

        if (input.length != buffer.length * 2) {
            throw new Error("cannot parse: " + input)
        }

        for (let i = 0; i < buffer.length; i++) {
            let hex = input.substring(i * 2, (i * 2) + 2);
            buffer[i] = parseInt(hex, 16)
        }

        return buffer;
    }

    buffer: Buffer;
    constructor(input: string);
    constructor(input: Buffer);
    constructor(input: MACAddress);
    constructor(input: unknown) {
        if (typeof input == "string") {
            this.buffer = MACAddress.parse(input);
        } else if (input instanceof MACAddress) {
            this.buffer = Buffer.from(input.buffer)
        } else if (input instanceof Uint8Array && (input.length * 8) == MACAddress.ADDRESS_LENGTH) {
            this.buffer = Buffer.from(input);
        } else {
            throw new Error("failed to initialize: " + MACAddress.name)
        }
    }

    toString(separator: typeof POSSIBLE_SEPARATOR[number] = "-") {
        let octets = new Array<string>(this.buffer.length);

        for (let i = 0; i < this.buffer.length; i++) {
            octets[i] = this.buffer[i].toString(16).padStart(2, "0")
        }

        return octets.join(separator);
    }

    isLocal(): boolean {
        // 7th bit
        return (this.buffer[0] & 2) == 2;
    }
    isUniversal(): boolean {
        return !this.isLocal();
    }
    isMulticast(): boolean {
        // 8th bit
        return (this.buffer[0] & 1) == 1;
    }
    isUnicast(): boolean {
        return !this.isMulticast();
    }
    isBroadcast(): boolean {
        for (let i = 0; i < this.buffer.length; i++) {
            if ((this.buffer[i] & 0xff) != 0xff) {
                return false;
            }
        }
        return true;
    }
};

export const MAC_ADDRESS = defineAddress(MACAddress);