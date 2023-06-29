import { IPV6_ADDRESS } from "../../address/ipv6";
import { defineStruct, UINT8, UINT16, SLICE, UINT32 } from "../../binary/struct";

/**
 * Sources <https://en.wikipedia.org/wiki/Internet_Control_Message_Protocol>, <https://www.saminiir.com/lets-code-tcp-ip-stack-2-ipv4-icmpv4/>
 */
export const ICMP_HEADER = defineStruct({
    type: UINT8,
    code: UINT8,
    csum: UINT16,
    data: SLICE
})

export const ICMP_UNUSED_HEADER = defineStruct({
    unused: UINT32,
    data: SLICE
})

export const ICMP_ECHO_HEADER = defineStruct({
    id: UINT16,
    seq: UINT16,
    data: SLICE
})

/** Source <https://en.wikipedia.org/wiki/Internet_Control_Message_Protocol#Destination_unreachable> */
export const ICMP_DESTINATION_UNREACHABLE = defineStruct({
    unused: UINT8,
    mtu: UINT8,
    data: SLICE
})


export const ICMP_NDP_HEADER = defineStruct({
    reserved: UINT32,
    targetAddress: IPV6_ADDRESS,
    options: SLICE
})