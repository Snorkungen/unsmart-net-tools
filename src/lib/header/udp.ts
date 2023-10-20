import { calculateChecksum } from "../binary/checksum";
import { defineStruct, UINT16, SLICE } from "../binary/struct";
import { IPV4_PSEUDO_HEADER, IPV6_PSEUDO_HEADER, PROTOCOLS } from "./ip";

export const UDP_HEADER = defineStruct({
    /** SPORT: Source Port */
    sport: UINT16,
    /** DPORT: Destination Port */
    dport: UINT16,
    length: UINT16,
    csum: UINT16,
    payload: SLICE
});

export function createUDPHeader({ sport, dport, payload }: {
    sport: number;
    dport: number;
    payload: Uint8Array
}, pseudoHdr?: typeof IPV4_PSEUDO_HEADER | typeof IPV6_PSEUDO_HEADER): typeof UDP_HEADER {
    let udpHdr = UDP_HEADER.create({
        sport, dport, payload,
        length: UDP_HEADER.getMinSize() + payload.byteLength
    });

    if (pseudoHdr) {
        pseudoHdr.set("proto", PROTOCOLS.UDP);
        pseudoHdr.set("len", udpHdr.size);

        udpHdr.set("csum", calculateChecksum(pseudoHdr.getBuffer()));
    }

    return udpHdr;
}