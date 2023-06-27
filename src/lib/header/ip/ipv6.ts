import { IPV6_ADDRESS } from "../../address/ipv6";
import { defineStruct, UINT8, UINT32, UINT16, SLICE, StructType } from "../../binary/struct";
import { Protocol } from "./protocols";


export const IPV6_HEADER = defineStruct({
    version: UINT8(4),
    trafficClass: UINT8,
    flowLabel: UINT32(20),
    payloadLength: UINT16,
    nextHeader: <StructType<Protocol>>UINT8,
    hopLimit: UINT8,
    saddr: IPV6_ADDRESS,
    daddr: IPV6_ADDRESS,

    payload: SLICE
});

IPV6_HEADER.set("version", 6);