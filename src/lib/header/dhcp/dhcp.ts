/**
 * # DCHP <https://www.rfc-editor.org/rfc/rfc2131>
 */

import { IPV4Address, IPV4_ADDRESS } from "../../address/ipv4";
import { MAC_ADDRESS } from "../../address/mac";
import { BYTE_ARRAY, SLICE, Struct, StructType, UINT16, UINT32, UINT8 } from "../../binary"
/**
```txt
   0                   1                   2                   3
   0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   |     op (1)    |   htype (1)   |   hlen (1)    |   hops (1)    |
   +---------------+---------------+---------------+---------------+
   |                            xid (4)                            |
   +-------------------------------+-------------------------------+
   |           secs (2)            |           flags (2)           |
   +-------------------------------+-------------------------------+
   |                          ciaddr  (4)                          |
   +---------------------------------------------------------------+
   |                          yiaddr  (4)                          |
   +---------------------------------------------------------------+
   |                          siaddr  (4)                          |
   +---------------------------------------------------------------+
   |                          giaddr  (4)                          |
   +---------------------------------------------------------------+
   |                                                               |
   |                          chaddr  (16)                         |
   |                                                               |
   |                                                               |
   +---------------------------------------------------------------+
   |                                                               |
   |                          sname   (64)                         |
   +---------------------------------------------------------------+
   |                                                               |
   |                          file    (128)                        |
   +---------------------------------------------------------------+
   |                                                               |
   |                          options (variable)                   |
   +---------------------------------------------------------------+

                  Figure 1:  Format of a DHCP message
```
*/
export const DHCP_HEADER = new Struct({
    /** Message op code / message type.  1 = BOOTREQUEST, 2 = BOOTREPLY */
    op: <StructType<typeof DCHP_OP[keyof typeof DCHP_OP]>>UINT8,
    /** Hardware address type, see ARP section in "Assigned Numbers" RFC; e.g., '1' = 10mb ethernet. */
    htype: UINT8,
    /** Hardware address length (e.g.  '6' for 10mb ethernet). */
    hlen: UINT8,
    /** Client sets to zero, optionally used by relay agents when booting via a relay agent. */
    hops: UINT8,
    /** Transaction ID, a random number chosen by the
                    client, used by the client and server to associate
                    messages and responses between a client and a
                    server. */
    xid: UINT32,
    /** Filled in by client, seconds elapsed since client
                    began address acquisition or renewal process.*/
    secs: UINT16,
    /** Unicast < 127; Broadcast > 127 */
    flags: UINT16,
    /** Client IP address; only filled in if client is in
                    BOUND, RENEW or REBINDING state and can respond
                    to ARP requests. */
    ciaddr: IPV4_ADDRESS,
    /** 'your' (client) IP address.*/
    yiaddr: IPV4_ADDRESS,
    /** IP address of next server to use in bootstrap;
                    returned in DHCPOFFER, DHCPACK by server. */
    siaddr: IPV4_ADDRESS,
    /** Relay agent IP address, used in booting via a
                    relay agent. */
    giaddr: IPV4_ADDRESS,
    /** Client Hardware Address. */
    chaddr: BYTE_ARRAY(16),
    /** Optional server host name, null terminated string.  */
    sname: BYTE_ARRAY(64),
    /** Boot file name, null terminated string; "generic"
                    name or null in DHCPDISCOVER, fully qualified
                    directory-path name in DHCPOFFER. 
    ***Assume to be ascii**
    */
    file: BYTE_ARRAY(128),
    /** Optional parameters field.  See the options
                    documents for a list of defined options.
                    
    > First 4 bytes are magic_cookie */
    options: SLICE,
});

export const DHCP_MAGIC = 0x63_82_53_63

export const DHCP_OPTION = new Struct({
    tag: UINT8,
    len: UINT8,
    data: SLICE
})

export const DCHP_OP = {
    BOOTREQUEST: 1,
    BOOTREPLY: 2
} as const;

/** I am not sure as to what the thinking of this is */
export const DHCP_CHADDR = new Struct({
    mac: MAC_ADDRESS,
    padding: BYTE_ARRAY(10)
})

