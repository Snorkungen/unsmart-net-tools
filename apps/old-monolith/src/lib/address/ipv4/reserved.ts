// DEPRECATED SOURCE of SOURCES <https://www.rfc-editor.org/rfc/rfc5735#section-4> DEPRECATED
// SOURCE of SOURCES <https://www.rfc-editor.org/rfc/rfc6890#section-2.2.2>

type AddressScope = "SOFTWARE" // <https://www.rfc-editor.org/rfc/rfc1122#section-3.2.1.3>
    | "PRIVATE_USE" // <https://www.rfc-editor.org/rfc/rfc1918>
    | "SHARED_ADDRESS_SPACE"  // <https://datatracker.ietf.org/doc/html/rfc6598>
    | "LOOPBACK" // <https://www.rfc-editor.org/rfc/rfc1122#section-3.2.1.3>
    | "LINK_LOCAL" // <https://www.rfc-editor.org/rfc/rfc3927> 
    | "PROTOCOL_ASSIGNMENT" // <https://www.rfc-editor.org/rfc/rfc5736> <- deprecated by <https://www.rfc-editor.org/rfc/rfc6890#section-2.1>
    | "DS_LITE" // https://www.rfc-editor.org/rfc/rfc6333
    | "TEST_NET" // <https://www.rfc-editor.org/rfc/rfc5737>
    | "6TO4_RELAY_ANYCAST" // <https://www.rfc-editor.org/rfc/rfc3068> <- deprecated by <https://www.rfc-editor.org/rfc/rfc7526>
    | "BENCHMARK" // <https://www.rfc-editor.org/rfc/rfc2544>
    | "RESERVED" // <https://www.rfc-editor.org/rfc/rfc1112#section-4>
    | "MULTICAST" // <https://www.rfc-editor.org/rfc/rfc3171> <- deprecated by <https://www.rfc-editor.org/rfc/rfc5771>
    | "BROADCAST"; // <https://www.rfc-editor.org/rfc/rfc0919#section-7>

type ReservedAddress = [address: string, maskLength: number, scope: AddressScope, ignore?: true];

export const reservedAddresses: Array<ReservedAddress> = [
    ["0.0.0.0", 8, "SOFTWARE"],
    ["10.0.0.0", 8, "PRIVATE_USE"],
    ["172.16.0.0", 12, "PRIVATE_USE"],
    ["192.168.0.0", 16, "PRIVATE_USE"],
    ["100.64.0.0", 10, "SHARED_ADDRESS_SPACE"], // Carrier-Grade NAT (CGN) devices
    ["169.254.0.0", 16, "LINK_LOCAL"],
    ["127.0.0.0", 8, "LOOPBACK"],
    ["192.0.0.0", 24, "PROTOCOL_ASSIGNMENT"],
    ["192.0.2.0", 24, "TEST_NET"], //  TEST-NET-1
    ["198.51.100.0", 24, "TEST_NET"], //  TEST-NET-2
    ["203.0.113.0", 24, "TEST_NET"], //  TEST-NET-3
    ["192.88.99.0", 24, "6TO4_RELAY_ANYCAST"],
    ["198.18.0.0", 15, "BENCHMARK"],
    ["224.0.0", 4, "MULTICAST"],
    ["240.0.0.0", 4, "RESERVED"],
    ["255.255.255.255", 32, "BROADCAST"]
];