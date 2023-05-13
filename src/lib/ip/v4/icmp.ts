// <https://en.wikipedia.org/wiki/Internet_Control_Message_Protocol>

import { BitArray } from "../../binary";
import { IPPacketV4 } from "../packet/v4";


const TYPE_BITS = new BitArray(0, 8);
const CODE_BITS = new BitArray(0, 8);

// I dont do checksum
const CHECKSUM_BITS = new BitArray(0, 16);
// ROH Rest Of Header
const ROH_BITS = new BitArray(0, 4 * 8); // 32 bits

export class ICMPPacketV4 {
    static getIPPacketBits(packet: IPPacketV4) {
        return packet.bits.slice(0, (packet.totalLength + 8) * 8);
    }

    bits: BitArray;

    constructor(bits: BitArray);
    constructor(type: ICMP_Type, code: number, roh: BitArray | null, ...content: BitArray[]);
    constructor(type: ICMP_Type | BitArray, code?: number, roh?: BitArray | null, ...content: BitArray[]) {

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

    get type(): ICMP_Type {
        return this.bits.slice(0, TYPE_BITS.size).toNumber() as ICMP_Type; 
    }

    get code(): number {
        return this.bits.slice(8, 8 + CODE_BITS.size).toNumber();
    }

    get roh(): BitArray {
        let offset = TYPE_BITS.size + CODE_BITS.size;
        return this.bits.slice(offset, offset + ROH_BITS.size)
    }

    get content(): BitArray {
        let offset = TYPE_BITS.size + CODE_BITS.size + ROH_BITS.size;
        return this.bits.slice(offset)
    }
}

export const ICMP_TYPES = {
    ECHO_REPLY: 0,
    DESTINATION_UNREACHABLE: 3,
    REDIRECT_MESSAGE: 5,
    ECHO_REQUEST: 8,
    ROUTER_ADVERTISMENT: 9,
    ROUTER_SOLICITATION: 10,
    TIME_EXCEEDED: 11,
    PARAMETER_PROBLEM: 12,
    TIMESTAMP: 13,
    TIMESTAMP_REPLY: 14,
    /** xping  reply */
    EXTENDED_ECHO_REPLY: 42,
    /** xping request */
    EXTENDED_ECHO_REQUEST: 43,
} as const;

export type ICMP_Type = typeof ICMP_TYPES[keyof typeof ICMP_TYPES];

export const ICMP_CODES = {
    [ICMP_TYPES.ECHO_REPLY]: 0,
    [ICMP_TYPES.DESTINATION_UNREACHABLE]: {
        UNREACHABLE_NETWORK: 0,
        UNREACHABLE_HOST: 1,
        UNREACHABLE_PROTOCOL: 2,
        UNREACHABLE_PORT: 3,
        /** Fragmentation required, and DF flag set  */
        REQUIRED_FRAGMENTATION: 4,
        /** Source route failed  */
        SOURCE_ROUTE: 5,
        UNKNOWN_NETWORK: 6,
        UNKNOWN_HOST: 7,
        /** Source host isolated  */
        SOURCE_HOST: 8,
        /** Network administratively prohibited  */
        PROHIBITED_NETWORK: 9,
        /** Host administratively prohibited  */
        PROHIBITED_HOST: 10,
        /** Network unreachable for ToS */
        UNREACHABLE_TOS_NETWORK: 11,
        /** Host unreachable for ToS */
        UNREACHABLE_TOS_HOST: 12,
        /** Communication administratively prohibited  */
        PROHIBITED_COMMUNICATON: 13,
        PRECEDENCE_HOST_VIOLATION: 14,
        PRECEDENCE_CUTOFF: 15
    },
    [ICMP_TYPES.REDIRECT_MESSAGE]: {
        NETWORK: 0,
        HOST: 1,
        TOS_NETWORK: 2,
        TOS_HOST: 3
    },
    [ICMP_TYPES.ECHO_REQUEST]: 0,
    [ICMP_TYPES.ROUTER_ADVERTISMENT]: 0,
    [ICMP_TYPES.ROUTER_SOLICITATION]: 0,
    [ICMP_TYPES.TIME_EXCEEDED]: {
        TTL: 0,
        FRAGMENT: 1
    },
    [ICMP_TYPES.PARAMETER_PROBLEM]: {
        POINTER: 0,
        OPTION: 1,
        LENGTH: 2
    },
    [ICMP_TYPES.TIMESTAMP]: 0,
    [ICMP_TYPES.TIMESTAMP_REPLY]: 0,
    [ICMP_TYPES.EXTENDED_ECHO_REQUEST]: 0,
    [ICMP_TYPES.EXTENDED_ECHO_REPLY]: {
        NO_ERROR: 0,
        QUERY_MALFORMED: 1,
        NO_INTERFACE: 2,
        NO_TABLE_ENTRY: 3,
        MULTIPLE_INTERFACES: 4
    },
} as const;
