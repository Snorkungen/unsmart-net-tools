import { uint8_mutateSet } from "../binary/uint8-array";
import { BaseAddress } from "./base";

const POSSIBLE_SEPARATOR = ["-", ":", "."] as const;
const SEPARATOR_REGEX = new RegExp(`[${POSSIBLE_SEPARATOR.join("")}]`, "ig");

export class MACAddress implements BaseAddress {
    static ADDRESS_LENGTH = 48;
    static parse(input: string): Uint8Array {
        let buffer = new Uint8Array(MACAddress.ADDRESS_LENGTH / 8);
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

    buffer: Uint8Array;
    constructor(input: string);
    constructor(input: Uint8Array);
    constructor(input: MACAddress);
    constructor(input: unknown) {
        if (typeof input == "string") {
            this.buffer = MACAddress.parse(input);
        } else if (input instanceof MACAddress) {
            this.buffer = new Uint8Array(input.buffer);
        } else if (input instanceof Uint8Array && (input.length * 8) == MACAddress.ADDRESS_LENGTH) {
            this.buffer = new Uint8Array(input);
        } else {
            throw new Error("failed to initialize: " + MACAddress.name)
        }
    }

    toString(separator: typeof POSSIBLE_SEPARATOR[number] = "-") {
        let octets = new Array<string>(this.buffer.byteLength);

        for (let i = 0; i < this.buffer.byteLength; i++) {
            octets[i] = this.buffer[i].toString(16).padStart(2, "0");
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
        for (let i = 0; i < this.buffer.byteLength; i++) {
            if ((this.buffer[0] & 0xff) != 0xff) {
                return false;
            }
        }
        return true;
    }

    toEUI64(): Uint8Array {
        let octets = new Uint8Array(8);
        uint8_mutateSet(octets, this.buffer.subarray(0, 3));
        octets[3] = 0xFF;
        octets[4] = 0xFE;
        uint8_mutateSet(octets, this.buffer.subarray(3), 5);
        return octets;
    }
};

