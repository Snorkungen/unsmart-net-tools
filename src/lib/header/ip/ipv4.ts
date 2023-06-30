import { Buffer } from "buffer";
import { IPV4Address, IPV4_ADDRESS } from "../../address/ipv4";
import { calculateChecksum } from "../../binary/checksum";
import { SLICE, StructType, UINT16, UINT8, defineStruct } from "../../binary/struct";
import { Protocol } from "./protocols";

/** Source <https://www.saminiir.com/lets-code-tcp-ip-stack-2-ipv4-icmpv4/> */
export const IPV4_HEADER = defineStruct({
    /** The 4-bit ```version``` field indicates the format of the Internet header. In our case, the value will be 4 for IPv4. */
    version: UINT8(4),
    /** The Internet Header Length field ```ihl``` is likewise 4 bits in length and indicates the number of 32-bit words in the IP header. Because the field is 4 bits in size, it can only hold a maximum value of 15. Thus the maximum length of an IP header is 60 octets (15 times 32 divided by eight). */
    ihl: UINT8(4),
    /** The type of service field ```tos``` originates from the first IP specification4. It has been divided into smaller fields in later specifications, but for simplicity’s sake, we will treat the field as defined in the original specification. The field communicates the quality of service intended for the IP datagram. */
    tos: UINT8,
    /** The total length field ```len``` communicates the length of the whole IP datagram. As it is a 16-bit field, the maximum length is then 65535 bytes. Large IP datagrams are subject to fragmentation, in which they are split into smaller datagrams in order to satisfy the Maximum Transmission Unit (MTU) of different communication interfaces. */
    len: UINT16,
    /** The ```id``` field is used to index the datagram and is ultimately used for reassembly of fragmented IP datagrams. The field’s value is simply a counter that is incremented by the sending party. In turn, the receiving side knows how to order the incoming fragments. */
    id: UINT16,
    /** The ```flags``` field defines various control flags of the datagram. In specific, the sender can specify whether the datagram is allowed to be fragmented, whether it is the last fragment or that there’s more fragments incoming. */
    flags: UINT16(3),
    /** The fragment offset field, ```fragOffset```, indicates the position of the fragment in a datagram. Naturally, the first datagram has this index set to 0. */
    fragOffset: UINT16(13),
    /** The ```ttl``` or time to live is a common attribute that is used to count down the datagram’s lifetime. It is usually set to 64 by the original sender, and every receiver decrements this counter by one. When it hits zero, the datagram is to be discarded and possibly an ICMP message is replied back to indicate an error. */
    ttl: UINT8,
    /** The ```proto``` field provides the datagram an inherent ability to carry other protocols in its payload. The field usually contains values such as 16 (UDP) or 6 (TCP), and is simply used to communicate the type of the actual data to the receiver. */
    proto: <StructType<Protocol>>UINT8,
    csum: UINT16,
    saddr: IPV4_ADDRESS,
    daddr: IPV4_ADDRESS,
    payload: SLICE
});

IPV4_HEADER.set("version", 4);

export function createIPV4Header<V extends Parameters<typeof IPV4_HEADER["create"]>[0] & {
    payload: Buffer;
    proto: Protocol;
    saddr: IPV4Address,
    daddr: IPV4Address
}>(values: V): typeof IPV4_HEADER {
    let hdr = IPV4_HEADER.create({
        version: 4,
        ihl: 5,
        tos: 0,
        ttl: 64
    }, {
        packed: true,
        bigEndian: true,
        "setDefaultValues": false
    });

    for (let k in values) {
        if (!hdr.order.includes(k as typeof hdr["order"][number])) continue;
        // @ts-ignore
        hdr.set(k, values[k])
    }

    // Set length
    hdr.set("len", hdr.getMinSize() + values.payload.byteLength);

    // set checksum 
    // I do not know how this is actually done because I havn't bothered to read the spec
    hdr.set("csum", calculateChecksum(hdr.getBuffer().subarray(0, 20)));

    return hdr;
}
