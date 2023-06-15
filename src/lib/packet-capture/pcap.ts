import { INT32, UINT16, UINT32, defineStruct } from "../binary/struct";

export const PCAP_GLOBAL_HEADER = defineStruct({
    /** magic number */
    magicNumber: UINT32.create(0xd4c3b2a1),
    /** major version number */
    versionMajor: UINT16.create(2),
    /** minor version number */
    versionMinor: UINT16.create(4),
    /** GMT to local correction */
    thiszone: INT32,
    /** accuracy of timestamps */
    sigfigs: UINT32,
    /** max length of captured packets, in octets */
    snaplen: UINT32,
    /** data link type */
    network: UINT32
});

