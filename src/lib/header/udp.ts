import { defineStruct, UINT16, SLICE } from "../binary/struct";

export const UDP_HEADER = defineStruct({
    /** SPORT: Source Port */
    sport: UINT16,
    /** DPORT: Destination Port */
    dport: UINT16,
    length: UINT16,
    csum: UINT16,
    payload: SLICE
});