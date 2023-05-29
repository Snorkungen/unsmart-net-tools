// <https://en.wikipedia.org/wiki/Internet_Control_Message_Protocol>

import { BitArray } from "../../binary";
import { IPPacketV6 } from "../packet/v6";


const TYPE_BITS = new BitArray(0, 8);
const CODE_BITS = new BitArray(0, 8);

// I dont do checksum
const CHECKSUM_BITS = new BitArray(0, 16);
// ROH Rest Of Header
const ROH_BITS = new BitArray(0, 32); // 32 bits

export class ICMPPacketV6 {
    /** This function is scuffed due to according to rfc this should be maximum possible in MTU(Max Transmission Unit) */
    static getIPPacketBits(packet: IPPacketV6) {
        return packet.bits.slice(0, (packet.payloadLength + 8) * 160);
    }

    bits: BitArray;

    constructor(bits: BitArray);
    constructor(type: ICMPV6_Type, code: number, roh: BitArray | null, ...content: BitArray[]);
    constructor(type: ICMPV6_Type | BitArray, code?: number, roh?: BitArray | null, ...content: BitArray[]) {

        if (type instanceof BitArray) {
            // should probably do some sanity checkin min length 64 bits
            this.bits = type;
            return;
        }

        if (code == undefined) {
            throw new Error("input incorrect")
        }

        if (!roh || roh.size > ROH_BITS.size) {
            roh = ROH_BITS
        }

        this.bits = TYPE_BITS.or(new BitArray(type)).concat(
            CODE_BITS.or(new BitArray(code)),
            CHECKSUM_BITS, // always ignore checksum
            ROH_BITS.or(roh),
            ...content
        )
    }

    get type(): ICMPV6_Type {
        return this.bits.slice(0, TYPE_BITS.size).toNumber() as ICMPV6_Type;
    }

    get code(): number {
        return this.bits.slice(8, 8 + CODE_BITS.size).toNumber();
    }

    get checksum(): BitArray {
        let offset = TYPE_BITS.size + CODE_BITS.size;
        return this.bits.slice(offset, offset + CHECKSUM_BITS.size)
    }

    get roh(): BitArray {
        let offset = TYPE_BITS.size + CODE_BITS.size + CHECKSUM_BITS.size;
        return this.bits.slice(offset, offset + ROH_BITS.size)
    }

    get content(): BitArray {
        let offset = TYPE_BITS.size + CODE_BITS.size + CHECKSUM_BITS.size + ROH_BITS.size;
        return this.bits.slice(offset)
    }
}

export const ICMPV6_TYPES = {
    DESTINATION_UNREACHABLE: 1,
    PACKET_TOO_BIG: 2,
    TIME_EXCEEDED: 3,
    PARAMETER_PROBLEM: 4,


    ECHO_REQUEST: 128,
    ECHO_REPLY: 129,

    NEIGHBOR_SOLICITATION: 135,
    NEIGHBOR_ADVERTISMENT: 136,
} as const;

export type ICMPV6_Type = typeof ICMPV6_TYPES[keyof typeof ICMPV6_TYPES];

export const ICMP_CODES = {
    [ICMPV6_TYPES.DESTINATION_UNREACHABLE]: {},
    [ICMPV6_TYPES.PACKET_TOO_BIG]: {},
    [ICMPV6_TYPES.TIME_EXCEEDED]: {},
    [ICMPV6_TYPES.PARAMETER_PROBLEM]: {},

    [ICMPV6_TYPES.ECHO_REQUEST]: 0,
    [ICMPV6_TYPES.ECHO_REPLY]: 0,
    [ICMPV6_TYPES.NEIGHBOR_SOLICITATION]: 0,
    [ICMPV6_TYPES.NEIGHBOR_ADVERTISMENT]: 0,

} as const;


export { readROHEcho, createROHEcho } from "../v4/icmp";