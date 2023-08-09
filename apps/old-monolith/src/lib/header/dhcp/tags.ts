/** Source <https://www.rfc-editor.org/rfc/rfc2132> */

export const DHCP_TAGS = {
    /** <3.1> The code for the pad option is 0, and its length is 1 octet. */
    PAD: 0,
    /** <3.2> The code for the end option is 255, and its length is 1 octet. */
    END: 255,
    /** <3.3> If both the subnet mask and the router option are specified in a DHCP reply, the subnet mask option MUST be first. The code for the subnet mask option is 1, and its length is 4 octets.*/
    SUBNET_MASK: 1,
    /** <3.4> The code for the time offset option is 2, and its length is 4 octets.    */
    TIME_OFFSET: 2,
    /** <3.5>  The code for the router option is 3.  The minimum length for the router option is 4 octets, and the length MUST always be a multiple of 4. */
    ROUTER: 3,
    /** <3.6> The code for the time server option is 4.  The minimum length for this option is 4 octets, and the length MUST always be a multiple of 4. */
    TIME_SERVER: 4,
    /** <3.7> The code for the name server option is 5.  The minimum length for this option is 4 octets, and the length MUST always be a multiple of 4.*/
    NAME_SERVER: 5,
    /** <3.8> The code for the domain name server option is 6.  The minimum length for this option is 4 octets, and the length MUST always be a multiple of 4. */
    DOMAIN_NAME_SERVER: 6,
    /** <3.9> The code for the log server option is 7.  The minimum length for this option is 4 octets, and the length MUST always be a multiple of 4.*/
    LOG_SERVER: 7,
    /** <3.10> The code for the cookie option is 8.  The minimum length for this option is 4 octets, and the length MUST always be a multiple of 4.*/
    COOKIE_SERVER: 8,
    /** <3.11> The code for the LPR server option is 9.  The minimum length for this option is 4 octets, and the length MUST always be a multiple of 4. */
    LPR_SERVER: 9,
    /** <3.12> The code for the Impress server option is 10.  The minimum length for this option is 4 octets, and the length MUST always be a multiple of 4. */
    IMPRESS_SERVER: 10,
    /** <3.13> The code for this option is 11.  The minimum length for this option is 4 octets, and the length MUST always be a multiple of 4. */
    RESOURCE_LOCATION_SERVER: 11,
    /** <3.14> The code for this option is 12, and its minimum length is 1. */
    HOST_NAME: 12,
    /** <3.15> The code for this option is 13, and its length is 2. */
    BOOT_FILE_SIZE: 13,
    /** <3.16> The code for this option is 14.  Its minimum length is 1. */
    MERIT_DUMP_SIZE: 14,
    /** <3.17> The code for this option is 15.  Its minimum length is 1. */
    DOMAIN_NAME: 15,
    /** <3.18> The code for this option is 16 and its length is 4. */
    SWAP_SERVER: 16,
    /** <3.19> The code for this option is 17.  Its minimum length is 1. */
    ROOT_PATH: 17,
    /** <3.20> The code for this option is 18.  Its minimum length is 1. */
    EXTENSIONS_PATH: 18,
    /** <4.1> The code for this option is 19, and its length is 1. */
    IP_FORWARDING: 19,
    /** <4.2> The code for this option is 20, and its length is 1. */
    NONLOCAL_SOURCE_ROUTING: 20,
    /** <4.3> The code for this option is 21.  The minimum length of this option is 8, and the length MUST be a multiple of 8. */
    POLICY_FILTER: 21,
    /** <4.4> The code for this option is 22, and its length is 2. */
    MAXIMUM_DATAGRAM_REASSEMBLY_SIZE: 22,
    /** <4.5> The code for this option is 23, and its length is 1. */
    DEFAULT_TTL: 23,
    /** <4.6> The code for this option is 24, and its length is 4. */
    PATH_MTU_AGING_TIMEOUT: 24,
    /** <4.7> The code for this option is 25. Its minimum length is 2, and the length MUST be a multiple of 2. */
    PATH_MTU_PLATEU_TABLE: 25,
    /** <5.1> The code for this option is 26, and its length is 2.*/
    INTERFACE_MTU: 26,
    /** <5.2> The code for this option is 27, and its length is 1. */
    ALL_SUBNETS_LOCAL: 27,
    /** <5.3> The code for this option is 28, and its length is 4.  */
    BROADCAST_ADDRESS: 28,
    /** <5.4>  The code for this option is 29, and its length is 1. */
    PERFORM_MASK_DISCOVERY: 29,
    /** <5.5> The code for this option is 30, and its length is 1. */
    MASK_SUPPLIER: 30,
    /** <5.6> The code for this option is 31, and its length is 1. */
    PERFORM_ROUTER_DISCOVERY: 31,
    /** <5.7> The code for this option is 32, and its length is 4. */
    ROUTER_SOLICITATION_ADDRESS: 32,
    /** <5.8> The code for this option is 33.  The minimum length of this option is 8, and the length MUST be a multiple of 8. */
    STATIC_ROUTE: 33,
    /** <6.1> The code for this option is 34, and its length is 1. */
    TRAILER_ENCAPSULATION: 34,
    /** <6.2> The code for this option is 35, and its length is 4. */
    ARP_CACHE_TIMEOUT: 35,
    /** <6.3> The code for this option is 36, and its length is 1. */
    ETHERNET_ENCAPSULATION: 36,
    /** <7.1> The code for this option is 37, and its length is 1. */
    TCP_DEFAULT_TTL: 37,
    /** <7.2> The code for this option is 38, and its length is 4. */
    TCP_KEEPALIVE_INTERVAL: 38,
    /** <7.3> The code for this option is 39, and its length is 1 */
    TCP_KEEPALIVE_GARBAGE: 39,
    /** <8.1> The code for this option is 40.  Its minimum length is 1. */
    NETWORK_INFORMATION_SERVICE_DOMAIN: 40,
    /** <8.2> The code for this option is 41.  Its minimum length is 4, and the length MUST be a multiple of 4. */
    NETWORK_INFORMATION_SERVERS: 41,
    /** <8.3> The code for this option is 42.  Its minimum length is 4, and the length MUST be a multiple of 4. */
    NETWORK_TIME_PROTOCOL_SERVERS: 42,
    /** <8.4> The code for this option is 43 and its minimum length is 1. */
    VENDOR_SPECIFIC_INFORMATION: 43,
    /** <8.5> The code for this option is 44.  The minimum length of the option is 4 octets, and the length must always be a multiple of 4. */
    NETBIOS_NAME_SERVER: 44,
    /** <8.6> The code for this option is 45.  The minimum length of the option is 4 octets, and the length must always be a multiple of 4. */
    NETBIOS_DISTROBUTION_SERVER: 45,
    /** <8.7> The code for this option is 46.  The length of this option is always 1. */
    NETBIOS_NODE_TYPE: 46,
    /** <8.8> The code for this option is 47.  The minimum length of this option is 1. */
    NETBIOS_SCOPE: 47,
    /** <8.9> The code for this option is 48.  The minimum length of this option is 4 octets, and the length MUST be a multiple of 4. */
    X_WINDOW_SYSTEM_FONT_SERVER: 48,
    /** <8.10> The code for the this option is 49. The minimum length of this option is 4, and the length MUST be a multiple of 4. */
    X_WINDOW_SYSTEM_DISPLAY_MANAGER: 49,
    /** <8.11> The code for this option is 64.  Its minimum length is 1. */
    NETWORK_INFORMATION_SERVICE_PLUS_DOMAIN: 64,
    /** <8.12> The code for this option is 65.  Its minimum length is 4, and the length MUST be a multiple of 4. */
    NETWORK_INFORMATION_SERVICE_PLUS_SERVERS: 65,
    /** <8.13> The code for this option is 68.  Its minimum length is 0 (indicating no home agents are available) and the length MUST be a multiple of 4. It is expected that the usual length will be four octets, containing a single home agent's address. Code Len    Home Agent Addresses (zero or more) */
    MOBILE_IP_HOME_AGENT: 68,
    /** <8.14> The code for the SMTP server option is 69.  The minimum length for this option is 4 octets, and the length MUST always be a multiple of 4. */
    SMTP_SERVERS: 69,
    /** <8.15> The code for the POP3 server option is 70.  The minimum length for this option is 4 octets, and the length MUST always be a multiple of 4. */
    POST_OFFICE_PROTOCOL_SERVERS: 70,
    /** <8.16> The code for the NNTP server option is 71. The minimum length for this option is 4 octets, and the length MUST always be a multiple of 4. */
    NETWORK_NEWS_TRANSPORT_PROTOCOL_SERVERS: 71,
    /** <8.17> The code for the WWW server option is 72.  The minimum length for this option is 4 octets, and the length MUST always be a multiple of 4. */
    DEFAULT_WWW_SERVERS: 72,
    /** <8.18> The code for the Finger server option is 73.  The minimum length for this option is 4 octets, and the length MUST always be a multiple of 4. */
    DEFAULT_FINGER_SERVERS: 73,
    /** <8.19> The code for the IRC server option is 74.  The minimum length for this option is 4 octets, and the length MUST always be a multiple of 4 */
    DEFAULT_IRC_SERVERS: 74,
    /** <8.20> The code for the StreetTalk server option is 75.  The minimum length for this option is 4 octets, and the length MUST always be a multiple of 4. */
    STREETTALK_SERVERS: 75,
    /** <8.21> The code for the StreetTalk Directory Assistance server option is 76. The minimum length for this option is 4 octets, and the length MUST always be a multiple of 4. */
    STREETTALK_DIRECTORY_ASSISTANCE_SERVERS: 76,

    /** Below are DHCP exclusive options */

    /** <9.1> The code for this option is 50, and its length is 4. */
    REQUESTED_IP_ADDRESS: 50,
    /** <9.2> The code for this option is 51, and its length is 4. */
    IP_ADDRESS_LEASE_TIME: 51,
    /** <9.3> The code for this option is 52, and its length is 1.  Legal values for this option are:
    ```txt
           Value   Meaning
           -----   --------
             1     the 'file' field is used to hold options
             2     the 'sname' field is used to hold options
             3     both fields are used to hold options
    ``` */
    OPTION_OVERLOAD: 52,
    /** <9.4> The code for this option is 66, and its minimum length is 1. */
    TFTP_SERVER_NAME: 66,
    /** <9.5> The code for this option is 67, and its minimum length is 1. */
    BOOTFILE_NAME: 67,
    /** <9.6> This option is used to convey the type of the DHCP message.  The code for this option is 53, and its length is 1.  Legal values for this option are:
    ```txt
           Value   Message Type
           -----   ------------
             1     DHCPDISCOVER
             2     DHCPOFFER
             3     DHCPREQUEST
             4     DHCPDECLINE
             5     DHCPACK
             6     DHCPNAK
             7     DHCPRELEASE
             8     DHCPINFORM 
        ``` */
    DHCP_MESSAGE_TYPE: 53,
    /** <9.7> The code for this option is 54, and its length is 4. */
    SERVER_IDENTIFIER: 54,
    /** <9.8> The code for this option is 55.  Its minimum length is 1. */
    PARAMETER_REQUEST_LIST: 55,
    /** <9.9> The code for this option is 56 and its minimum length is 1. */
    ERROR_MESSAGE: 56,
    /** <9.10> The code for this option is 57, and its length is 2.  The minimum legal value is 576 octets. */
    MAXIMUM_DCHP_MESSAGE_SIZE: 57,
    /** <9.11> The code for this option is 58, and its length is 4. */
    RENEWAL_TIME_VALUE: 58,
    /** <9.12> The code for this option is 59, and its length is 4. */
    REBINDING_TIME_VALUE: 59,
    /** <9.13> The code for this option is 60, and its minimum length is 1. */
    VENDOR_CLASS_IDENTIFIER: 60,
    /** <9.14> The code for this option is 61, and its minimum length is 2. */
    CLIENT_IDENTIFIER: 61,
} as const;

/** @see DHCP_TAGS.DHCP_MESSAGE_TYPE */
export const DHCP_MESSGAGE_TYPES = {
    DHCPDISCOVER: 1,
    DHCPOFFER: 2,
    DHCPREQUEST: 3,
    DHCPDECLINE: 4,
    DHCPACK: 5,
    DHCPNAK: 6,
    DHCPRELEASE: 7,
    DHCPINFORM: 8,
} as const;

export type DHCPTag = typeof DHCP_TAGS[keyof typeof DHCP_TAGS];
export type DHCPMessageType = typeof DHCP_MESSGAGE_TYPES[keyof typeof DHCP_MESSGAGE_TYPES];