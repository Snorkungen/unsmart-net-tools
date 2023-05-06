// <https://en.wikipedia.org/wiki/Internet_Control_Message_Protocol>

import { BitArray } from "../../binary";
import { IPPacketV4 } from "./packet";


const TYPE_BITS = new BitArray(0, 8);
const CODE_BITS = new BitArray(0, 8);

// I dont do checksum
const CHECKSUM_BITS = new BitArray(0, 16);

export class ICMPPacketV4 {
    static getIPPacketBits(packet: IPPacketV4) {
        return packet.bits.slice(0, (packet.totalLength + 8) * 8);
    }

    bits: BitArray;

    constructor(type: number, code: number, ...content: BitArray[]) {
        this.bits = TYPE_BITS.or(new BitArray(type)).concat(
            CODE_BITS.or(new BitArray(code)),
            CHECKSUM_BITS, // always ignore checksum
            ...content
        )
    }

    get type(): number {
        return this.bits.slice(0, TYPE_BITS.size).toNumber();
    }

    get code(): number {
        return this.bits.slice(8, 8 + CODE_BITS.size).toNumber();
    }

    get content(): BitArray {
        return this.bits.slice(32)
    }
}
