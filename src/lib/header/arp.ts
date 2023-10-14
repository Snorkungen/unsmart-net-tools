import { StructType, UINT16, UINT8, defineStruct } from "../binary/struct";
import { IPV4_ADDRESS, MAC_ADDRESS } from "../struct-types/address";

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

export function createARPHeader<V extends Parameters<typeof ARP_HEADER["create"]>[0] & {
    oper: ARPOpcode;
}>(values: V): typeof ARP_HEADER {
    let hdr = ARP_HEADER.create({
        htype: 1,
        ptype: 0x0800, // PROTOCOLS.IPv4
        hlen: 6,
        plen: 4,
    })

    for (let k in values) {
        if (!hdr.order.includes(k as typeof hdr["order"][number])) continue;
        // @ts-ignore
        hdr.set(k, values[k])
    }

    return hdr;
}