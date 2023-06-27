import { MAC_ADDRESS } from "../../address/mac";
import { defineStruct, UINT16, SLICE, StructType } from "../../binary/struct";
import { EtherType } from "../../ethernet/types";

/*
    IMPORTANT! if i were to read this then rememvber to implement FCS / CRC32
*/

/** 
Source: <https://en.wikipedia.org/wiki/Ethernet_frame>
*/
export const ETHERNET_HEADER = defineStruct({
    dmac: MAC_ADDRESS,
    smac: MAC_ADDRESS,
    ethertype: <StructType<EtherType>>UINT16,
    payload: SLICE
});

/**
 #### ***Name probably should be changed but essentially this vlan header***
 Source <https://en.wikipedia.org/wiki/IEEE_802.1Q>
 */
export const ETHERNET_DOT1Q_HEADER = defineStruct({
    pcp: UINT16(3),
    dei: UINT16(1),
    vid: UINT16(12),
    ethertype: <StructType<EtherType>>UINT16,
    payload: SLICE
})