import { BitArray } from "../binary";
import { AddressV4 } from "../ip/v4";
import { MACAddress } from "./mac";


const HARDWARE_TYPE_BITS = new BitArray(0, 16)
    // because i'm just using ethernet
    .or(new BitArray(1))

const PROTOCOL_TYPE_BITS = new BitArray(0, 16)
    // because i'm only planning on using ipv4 rn
    .or(new BitArray(0x0800))

const HARDWARE_LENGTH_BITS = new BitArray(0, 8)
    // because i'm just using ethernet
    .or(new BitArray(MACAddress.address_length / 8)) // 6 for mac address just why not

const PROTOCOL_LENGTH_BITS = new BitArray(0, 8)
    // because i'm only planning on using ipv4 rn
    .or(new BitArray(AddressV4.address_length / 8)) // 4 for ipv4 address just why not 

const OPERATION_BITS = new BitArray(0, 16);
// 1 = request | 2 = reply


export class ARPPacket {
    bits: BitArray;

    constructor(operation: BitArray);
    constructor(operation: 1 | 2, senderHardwareBits: BitArray, senderProtocolBits: BitArray, targetHardwareBits: BitArray, targetProtocolBits: BitArray);
    constructor(operation: unknown, senderHardwareBits?: BitArray, senderProtocolBits?: BitArray, targetHardwareBits?: BitArray, targetProtocolBits?: BitArray
    ) {
        if (operation instanceof BitArray) {
            this.bits = operation;
            return;
        } else if (typeof operation != "number") {
            throw new Error("invalid input for operation")
        }

        this.bits = HARDWARE_TYPE_BITS.concat(
            PROTOCOL_TYPE_BITS,
            HARDWARE_LENGTH_BITS,
            PROTOCOL_LENGTH_BITS,
            OPERATION_BITS.or(new BitArray(operation)),
        )

        // verify that addresses are the correct length

        if (senderHardwareBits?.size != this.hardwareLength * 8) {
            throw new Error("senderHardwareBits incorrect size")
        }
        if (senderProtocolBits?.size != this.protocolLength * 8) {
            throw new Error("senderProtocolBits incorrect size")
        }
        if (targetHardwareBits?.size != this.hardwareLength * 8) {
            throw new Error("targetHardwareBits incorrect size")
        }
        if (targetProtocolBits?.size != this.protocolLength * 8) {
            throw new Error("targetProtocolBits incorrect size")
        }

        this.bits = this.bits.concat(
            senderHardwareBits,
            senderProtocolBits,
            targetHardwareBits,
            targetProtocolBits
        )
    }

    get hardwareType(): number {
        return this.bits.slice(0, HARDWARE_TYPE_BITS.size).toNumber()
    }

    get protocolType(): number {
        return this.bits.slice(HARDWARE_TYPE_BITS.size, HARDWARE_TYPE_BITS.size + PROTOCOL_TYPE_BITS.size).toNumber()
    }

    get hardwareLength(): number {
        let offset = HARDWARE_TYPE_BITS.size + PROTOCOL_TYPE_BITS.size;
        return this.bits.slice(offset, offset + HARDWARE_LENGTH_BITS.size).toNumber()
    }

    get protocolLength(): number {
        let offset = HARDWARE_TYPE_BITS.size + PROTOCOL_TYPE_BITS.size + HARDWARE_LENGTH_BITS.size;
        return this.bits.slice(offset, offset + PROTOCOL_LENGTH_BITS.size).toNumber()
    }

    get operation(): number {
        let offset = HARDWARE_TYPE_BITS.size + PROTOCOL_TYPE_BITS.size + HARDWARE_LENGTH_BITS.size + PROTOCOL_LENGTH_BITS.size;
        return this.bits.slice(offset, offset + OPERATION_BITS.size).toNumber()
    }

    get senderHardware(): BitArray {
        let offset = HARDWARE_TYPE_BITS.size + PROTOCOL_TYPE_BITS.size + HARDWARE_LENGTH_BITS.size + PROTOCOL_LENGTH_BITS.size + OPERATION_BITS.size;
        return this.bits.slice(offset, offset + (this.hardwareLength * 8))
    }

    get senderProtocol(): BitArray {
        let offset = HARDWARE_TYPE_BITS.size + PROTOCOL_TYPE_BITS.size + HARDWARE_LENGTH_BITS.size + PROTOCOL_LENGTH_BITS.size + OPERATION_BITS.size + (this.hardwareLength * 8);
        return this.bits.slice(offset, offset + (this.protocolLength * 8))
    }

    get targetHardware(): BitArray {
        let offset = HARDWARE_TYPE_BITS.size + PROTOCOL_TYPE_BITS.size + HARDWARE_LENGTH_BITS.size + PROTOCOL_LENGTH_BITS.size + OPERATION_BITS.size + (this.hardwareLength * 8) + (this.protocolLength * 8);
        return this.bits.slice(offset, offset + (this.hardwareLength * 8))
    }

    get targetProtocol(): BitArray {
        let offset = HARDWARE_TYPE_BITS.size + PROTOCOL_TYPE_BITS.size + HARDWARE_LENGTH_BITS.size + PROTOCOL_LENGTH_BITS.size + OPERATION_BITS.size + (this.hardwareLength * 8) + (this.protocolLength * 8) + (this.hardwareLength * 8);
        return this.bits.slice(offset, offset + (this.protocolLength * 8))
    }

}
