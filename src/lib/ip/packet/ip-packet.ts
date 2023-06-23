import { BitArray } from "../../binary"
import { defineStructType, defineStruct, UINT8, UINT16, UINT32 } from "../../binary/struct"
import { AddressV4 } from "../v4"
import { AddressV6 } from "../v6"

const IPV4_ADDRESS = defineStructType({
    bitLength: AddressV4.address_length,
    getter(buffer) {
        return new AddressV4(new BitArray(buffer.toString("hex"), 16))
    },
    setter(val) {
        return Buffer.from(val.bits.toString(16), "hex")
    }
})

export const IPV4_HEADER = defineStruct({
    version: UINT8(4),
    ihl: UINT8(4),
    tos: UINT8,
    len: UINT16,
    id: UINT16,
    flags: UINT16(3),
    fragOffset: UINT16(13),
    ttl: UINT8,
    proto: UINT8,
    csum: UINT16,
    saddr: IPV4_ADDRESS,
    daddr: IPV4_ADDRESS,
});

const IPV6_ADDRESS = defineStructType({
    bitLength: AddressV6.address_length,
    getter(buffer) {
        return new AddressV6(new BitArray(buffer.toString("hex"), 16));
    },
    setter(value) {
        return Buffer.from(value.bits.toString(16), "hex")
    }
})

export const IPV6_HEADER = defineStruct({
    version: UINT8(4),
    trafficClass: UINT8,
    flowLabel: UINT32(20),
    payloadLength: UINT16,
    nextHeader: UINT8,
    hopLimit: UINT8,
    saddr: IPV6_ADDRESS,
    daddr: IPV6_ADDRESS,
})