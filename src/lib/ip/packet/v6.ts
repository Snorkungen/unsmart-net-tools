import { BitArray } from "../../binary";
import { AddressV6 } from "../v6";
import { PROTOCOL } from "./protocols";
import { assertFitsInBitArray } from "./v4";


/** Always 6 for ipv6 */
const VERSION_BITS = new BitArray("0110", 2);

/** Future me problem read more into it */
const TRAFFIC_CLASS_BITS = new BitArray(0, 6);

const FLOW_LABEL_BITS = new BitArray(0, 20);

const PAYLOAD_LENGTH_BITS = new BitArray(0, 16);

const NEXT_HEADER_BITS = new BitArray(0, 16);

const HOP_LIMIT_BITS = new BitArray(0, 16);

const DEFAULT_HOP_LIMIT = 64;

export class IPPacketV6 {
    bits: BitArray;

    constructor(source: AddressV6, destination: AddressV6, protocol: PROTOCOL, payload: BitArray, hopLimit?: number, flowLabel?: BitArray)
    constructor(source: BitArray)
    constructor(source: AddressV6 | BitArray, destination?: AddressV6, protocol?: PROTOCOL, payload?: BitArray, hopLimit = DEFAULT_HOP_LIMIT, flowLabel = FLOW_LABEL_BITS) {

        if (source instanceof BitArray) {
            this.bits = source;
            return;
        }


        assertFitsInBitArray(hopLimit, HOP_LIMIT_BITS)
        assertFitsInBitArray(protocol!, NEXT_HEADER_BITS)

        this.bits = VERSION_BITS.concat(
            TRAFFIC_CLASS_BITS,
            flowLabel,
            PAYLOAD_LENGTH_BITS,
            NEXT_HEADER_BITS.or(new BitArray(protocol!)),
            HOP_LIMIT_BITS.or(new BitArray(hopLimit)),
            source.bits,
            destination!.bits
        )

        this.bits.splice(32, 32 + PAYLOAD_LENGTH_BITS.size, PAYLOAD_LENGTH_BITS.or(new BitArray(
            Math.ceil(this.bits.size / 8)
        )))
    }

    get version(): number {
        return this.bits.slice(0, VERSION_BITS.size).toNumber();
    }

    get trafficClass(): BitArray {
        let offset = VERSION_BITS.size;
        return this.bits.slice(offset, offset + TRAFFIC_CLASS_BITS.size);
    }
    
    get flowLabel(): BitArray {
        let offset = VERSION_BITS.size + TRAFFIC_CLASS_BITS.size;
        return this.bits.slice(offset, offset + FLOW_LABEL_BITS.size);
    }

    get payloadLength(): number {
        let offset = VERSION_BITS.size + TRAFFIC_CLASS_BITS.size + FLOW_LABEL_BITS.size;
        return this.bits.slice(offset, offset + PAYLOAD_LENGTH_BITS.size).toNumber();
    }

    get nextHeader(): PROTOCOL {
        let offset = VERSION_BITS.size + TRAFFIC_CLASS_BITS.size + FLOW_LABEL_BITS.size + PAYLOAD_LENGTH_BITS.size;
        return this.bits.slice(offset, offset + NEXT_HEADER_BITS.size).toNumber() as PROTOCOL;
    }

    get hopLimit(): number {
        let offset = VERSION_BITS.size + TRAFFIC_CLASS_BITS.size + FLOW_LABEL_BITS.size + PAYLOAD_LENGTH_BITS.size + NEXT_HEADER_BITS.size;
        return this.bits.slice(offset, offset + HOP_LIMIT_BITS.size).toNumber();
    }

    get source(): AddressV6 {
        let offset = VERSION_BITS.size + TRAFFIC_CLASS_BITS.size + FLOW_LABEL_BITS.size + PAYLOAD_LENGTH_BITS.size + NEXT_HEADER_BITS.size + HOP_LIMIT_BITS.size;
        return new AddressV6(
            this.bits.slice(offset, offset + AddressV6.address_length)
        )
    }

    get destination(): AddressV6 {
        let offset = VERSION_BITS.size + TRAFFIC_CLASS_BITS.size + FLOW_LABEL_BITS.size + PAYLOAD_LENGTH_BITS.size + NEXT_HEADER_BITS.size + HOP_LIMIT_BITS.size + AddressV6.address_length;
        return new AddressV6(
            this.bits.slice(offset, offset + AddressV6.address_length)
        )
    }
}