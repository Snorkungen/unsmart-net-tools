export const ICMPV4_TYPES = {
    ECHO_REPLY: 0,
    DESTINATION_UNREACHABLE: 3,
    REDIRECT_MESSAGE: 5,
    ECHO_REQUEST: 8,
    ROUTER_ADVERTISMENT: 9,
    ROUTER_SOLICITATION: 10,
    TIME_EXCEEDED: 11,
    PARAMETER_PROBLEM: 12,
    TIMESTAMP: 13,
    TIMESTAMP_REPLY: 14,
    /** xping  reply */
    EXTENDED_ECHO_REPLY: 42,
    /** xping request */
    EXTENDED_ECHO_REQUEST: 43,
} as const;

export type ICMPV4_Type = typeof ICMPV4_TYPES[keyof typeof ICMPV4_TYPES];

export const ICMPV4_CODES = {
    [ICMPV4_TYPES.ECHO_REPLY]: 0,
    [ICMPV4_TYPES.DESTINATION_UNREACHABLE]: {
        UNREACHABLE_NETWORK: 0,
        UNREACHABLE_HOST: 1,
        UNREACHABLE_PROTOCOL: 2,
        UNREACHABLE_PORT: 3,
        /** Fragmentation required, and DF flag set  */
        REQUIRED_FRAGMENTATION: 4,
        /** Source route failed  */
        SOURCE_ROUTE: 5,
        UNKNOWN_NETWORK: 6,
        UNKNOWN_HOST: 7,
        /** Source host isolated  */
        SOURCE_HOST: 8,
        /** Network administratively prohibited  */
        PROHIBITED_NETWORK: 9,
        /** Host administratively prohibited  */
        PROHIBITED_HOST: 10,
        /** Network unreachable for ToS */
        UNREACHABLE_TOS_NETWORK: 11,
        /** Host unreachable for ToS */
        UNREACHABLE_TOS_HOST: 12,
        /** Communication administratively prohibited  */
        PROHIBITED_COMMUNICATON: 13,
        PRECEDENCE_HOST_VIOLATION: 14,
        PRECEDENCE_CUTOFF: 15
    },
    [ICMPV4_TYPES.REDIRECT_MESSAGE]: {
        NETWORK: 0,
        HOST: 1,
        TOS_NETWORK: 2,
        TOS_HOST: 3
    },
    [ICMPV4_TYPES.ECHO_REQUEST]: 0,
    [ICMPV4_TYPES.ROUTER_ADVERTISMENT]: 0,
    [ICMPV4_TYPES.ROUTER_SOLICITATION]: 0,
    [ICMPV4_TYPES.TIME_EXCEEDED]: {
        TTL: 0,
        FRAGMENT: 1
    },
    [ICMPV4_TYPES.PARAMETER_PROBLEM]: {
        POINTER: 0,
        OPTION: 1,
        LENGTH: 2
    },
    [ICMPV4_TYPES.TIMESTAMP]: 0,
    [ICMPV4_TYPES.TIMESTAMP_REPLY]: 0,
    [ICMPV4_TYPES.EXTENDED_ECHO_REQUEST]: 0,
    [ICMPV4_TYPES.EXTENDED_ECHO_REPLY]: {
        NO_ERROR: 0,
        QUERY_MALFORMED: 1,
        NO_INTERFACE: 2,
        NO_TABLE_ENTRY: 3,
        MULTIPLE_INTERFACES: 4
    },
} as const;
