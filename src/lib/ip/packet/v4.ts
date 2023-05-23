// <https://en.wikipedia.org/wiki/Internet_Protocol_version_4#Packet_structure>

import { BitArray } from "../../binary";
import { AddressV4 } from "../v4/address";
import { PROTOCOL } from "./protocols";

export const assertFitsInBitArray = (n: number, bitArray: BitArray) => {
    if (n < 0 || n >= 2 ** bitArray.size) {
        throw new Error("this number incorrect for slot in packet")
    }
}

// Always 4 for ipv4
const VERSION_BITS = new BitArray(0, 4).or(new BitArray(4))

const IHL_BITS = new BitArray(0, 4);

// optional ignoring for now
const DSCP_BITS = new BitArray(0, 6);

// optional ignoring for now
const ECN_BITS = new BitArray(0, 2);

const TOTAL_LENGTH_BITS = new BitArray(0, 16);

// not really optional but not implementing fragmenting for now
const IDENTIFICATION_BITS = new BitArray(0, 16);

// flags tell for fragments but we're not fragmenting rn
const FLAG_BITS = new BitArray("010", 2);

// not fragmenting so ignore rn
const FRAGMENT_OFFSET_BITS = new BitArray(0, 13);

const TTL_BITS = new BitArray(0, 8);

const PROTOCOL_BITS = new BitArray(0, 8);

// i'm not good enough to implement checksum
const HEADER_CHEKSUM_BITS = new BitArray(0, 16)

export class IPPacketV4 {

    // ihl internet header length
    // total length

    bits: BitArray;

    constructor(source: AddressV4, destination: AddressV4, protocol: PROTOCOL, payload: BitArray, ttl?: number)
    constructor(source: BitArray)
    constructor(source: AddressV4 | BitArray, destination?: AddressV4, protocol?: PROTOCOL, payload?: BitArray, ttl = 255) {

        if (source instanceof BitArray) {
            this.bits = source;
            return;
        }

        if (!destination || !protocol || !payload) {
            throw new Error("invalid input for ip packet v4")
        }

        assertFitsInBitArray(protocol, PROTOCOL_BITS);
        assertFitsInBitArray(ttl, TTL_BITS);


        // since i'm not doing options ihl will be fixed
        const ihl = 5;

        this.bits = VERSION_BITS.concat(
            IHL_BITS.or(new BitArray(ihl)),
            DSCP_BITS,
            ECN_BITS,
            TOTAL_LENGTH_BITS,
            IDENTIFICATION_BITS,
            FLAG_BITS,
            FRAGMENT_OFFSET_BITS,
            TTL_BITS.or(new BitArray(ttl)),
            PROTOCOL_BITS.or(new BitArray(protocol)),
            HEADER_CHEKSUM_BITS,
            source.bits,
            destination.bits,

            // here would the options go if i was bothered

            payload
        )
        // not doing this seriously this project is too big for me

        let totalLengthBits = TOTAL_LENGTH_BITS.or(new BitArray(
            Math.ceil(this.bits.size / 8)
        ))

        this.bits.splice(16, totalLengthBits.size, totalLengthBits);

    }

    get version(): number {
        return this.bits.slice(0, 4).toNumber();
    }

    get ihl(): number {
        return this.bits.slice(4, 8).toNumber()
    }

    get totalLength(): number {
        return this.bits.slice(16, 32).toNumber()
    }

    get ttl(): number {
        return this.bits.slice(64, 72).toNumber();
    }

    set ttl(ttl: number) {
        assertFitsInBitArray(ttl, TTL_BITS);
        this.bits.splice(64, TTL_BITS.size, TTL_BITS.or(new BitArray(ttl)));
    }

    get protocol(): number {
        return this.bits.slice(72, 72 + PROTOCOL_BITS.size).toNumber();
    }

    get source(): AddressV4 {
        return new AddressV4(this.bits.slice(96, 96 + AddressV4.address_length));
    }
    get destination(): AddressV4 {
        return new AddressV4(this.bits.slice(128, 128 + AddressV4.address_length));
    }

    get payload(): BitArray {
        return this.bits.slice(this.ihl * 32);
    }
}