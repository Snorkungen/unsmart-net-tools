import { IPV4_ADDRESS } from "../../address/ipv4";
import { SLICE, StructType, UINT16, UINT8, defineStruct } from "../../binary/struct";
import { Protocol } from "./protocols";

export const IPV4_HEADER = defineStruct({
    version: UINT8(4),
    ihl: UINT8(4),
    tos: UINT8,
    len: UINT16,
    id: UINT16,
    flags: UINT16(3),
    fragOffset: UINT16(13),
    ttl: UINT8,
    proto: <StructType<Protocol>>UINT8,
    csum: UINT16,
    saddr: IPV4_ADDRESS,
    daddr: IPV4_ADDRESS,
    payload: SLICE
});