/**
 * Source:
 * RFC 9293
 * 
 */

import { SLICE, UINT16, UINT32, UINT8, defineStruct } from "../binary";

/**
 * Source: [RFC 9293](https://datatracker.ietf.org/doc/html/rfc9293)
 * 
 * ```txt
 *   0                   1                   2                   3
 *   0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *  |          Source Port          |       Destination Port        |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *  |                        Sequence Number                        |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *  |                    Acknowledgment Number                      |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *  |  Data |       |C|E|U|A|P|R|S|F|                               |
 *  | Offset| Rsrvd |W|C|R|C|S|S|Y|I|            Window             |
 *  |       |       |R|E|G|K|H|T|N|N|                               |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *  |           Checksum            |         Urgent Pointer        |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *  |                           [Options]                           |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *  |                                                               :
 *  :                             Data                              :
 *  :                                                               |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+ *
 *         Note that one tick mark represents one bit position.
 *                      Figure 1: TCP Header Format
 * ```
 */
export const TCP_HEADER = defineStruct({
    /** The source port number. */
    sport: UINT16,

    /** The destination port number. */
    dport: UINT16,

    /**  The sequence number of the first data octet in this segment (except when the SYN flag is set). If SYN is set, the sequence number is the initial sequence number (ISN) and the first data octet is ISN+1. */
    seqnum: UINT32,

    /** If the ACK control bit is set, this field contains the value of the next sequence number the sender of the segment is expecting to receive. Once a connection is established, this is always sent. */
    acknum: UINT32,

    /** The number of 32-bit words in the TCP header. This indicates where the data begins. The TCP header (even one including options) is an integer multiple of 32 bits long. */
    doffset: UINT8(4),

    /** A set of control bits reserved for future use. Must be zero in generated segments and must be ignored in received segments if the corresponding future features are not implemented by the sending or receiving host. */
    _1: UINT8(4),

    /** The control bits are also known as "flags". Assignment is managed by IANA from the "TCP Header Flags" registry [62](https://www.iana.org/assignments/tcp-parameters/). The currently assigned control bits are CWR, ECE, URG, ACK, PSH, RST, SYN, and FIN */
    flags: UINT8,

    /** The number of data octets beginning with the one indicated in the acknowledgment field that the sender of this segment is willing to accept. The value is shifted when the window scaling extension is used [[47](https://datatracker.ietf.org/doc/html/rfc7323)]. 
     * \
     * \
     *  The window size **MUST** be treated as an unsigned number, or else large window sizes will appear like negative windows and TCP will not work (MUST-1). It is **RECOMMENDED** that implementations will reserve 32-bit fields for the send and receive window sizes in the connection record and do all window computations with 32 bits (REC-1). */
    window: UINT16,

    /** The checksum field is the 16-bit ones' complement of the ones' complement sum of all 16-bit words in the header and text. The checksum computation needs to ensure the 16-bit alignment of the data being summed. If a segment contains an odd number of header and text octets, alignment can be achieved by padding the last octet with zeros on its right to form a 16-bit word for checksum purposes. The pad is not transmitted as part of the segment. While computing the checksum, the checksum field itself is replaced with zeros.
     * \
     * \
     * The checksum also covers a pseudo-header (Figure [2](https://datatracker.ietf.org/doc/html/rfc9293#v4pseudo)) conceptually prefixed to the TCP header. The pseudo-header is 96 bits for IPv4 and 320 bits for IPv6. Including the pseudo-header in the checksum gives the TCP connection protection against misrouted segments. This information is carried in IP headers and is transferred across the TCP/network interface in the arguments or results of calls by the TCP implementation on the IP layer. */
    csum: UINT16,

    /** This field communicates the current value of the urgent pointer as a positive offset from the sequence number in this segment. The urgent pointer points to the sequence number of the octet following the urgent data. This field is only to be interpreted in segments with the URG control bit set. */
    urgpnt: UINT16,

    /**
     * Payload includes Options & Data fields
     */
    payload: SLICE,
});

/** @see {@link TCP_HEADER} `flags` field */
export const TCP_FLAGS = {
    /** Congestion Window Reduced (see [[6](https://datatracker.ietf.org/doc/html/rfc3168)]). */
    CWR: 0x80,
    /** ECN-Echo (see [[6](https://datatracker.ietf.org/doc/html/rfc3168)]) */
    ECE: 0x40,
    /** Urgent pointer field is significant. */
    URG: 0x20,
    /** Acknowledgment field is significant. */
    ACK: 0x10,
    /** Push function (see the Send Call description in [Section 3.9.1](https://datatracker.ietf.org/doc/html/rfc9293#user-api)) */
    PSH: 0x08,
    /** Reset the connection. */
    RST: 0x04,
    /** Synchronize sequence numbers. */
    SYN: 0x02,
    /** No more data from sender. */
    FIN: 0x01
} as const;