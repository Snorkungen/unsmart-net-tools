import {  IPV4_ADDRESS } from "../address/ipv4";
import { MAC_ADDRESS } from "../address/mac";
import { StructType, UINT16, UINT8, defineStruct } from "../binary/struct";

/** Source <https://en.wikipedia.org/wiki/Address_Resolution_Protocol> */
export const ARP_HEADER = defineStruct({
    /** Hardware Type */
    htype: UINT16,
    /** Protocol Type */
    ptype: UINT16,
    /** Hardware Address Length */
    hlen: UINT8,
    /** Protocol address length */
    plen: UINT8,
    /** Operation */
    oper: <StructType<ARPOpcode>>UINT16,
    /** Sender Hardware Address */
    sha: MAC_ADDRESS,
    /** Sender Protocol Address */
    spa: IPV4_ADDRESS,
    /** Target Hardware Address */
    tha: MAC_ADDRESS,
    /** Target Protocol Address */
    tpa: IPV4_ADDRESS
});

export type ARPHeader = typeof ARP_HEADER;
export type ARPOpcode = typeof ARP_OPCODES[keyof typeof ARP_OPCODES];
export const ARP_OPCODES = {
    REQUEST: 1,
    REPLY: 2
} as const;