type AddressScope = "SOFTWARE" | "PRIVATE_NETWORK" | "LOCALHOST" | "INTERNET" | "DOCUMENTATION" | "SUBNET";
type ReservedAddress = [address: string, maskLength: number, scope: AddressScope, ignore?: true];

// SOURCE https://en.wikipedia.org/wiki/Reserved_IP_addresses#IPv4

export const reservedAddresses: Array<ReservedAddress> = [
    ["0.0.0.0", 8, "SOFTWARE"],
    ["10.0.0.0", 8, "PRIVATE_NETWORK"],
    ["100.64.0.0.0", 10, "PRIVATE_NETWORK", true], // I'm not sure because i would not like to use this one
    ["127.0.0.0", 8, "LOCALHOST"],
    ["169.254.0.0", 16, "SUBNET"],
    ["172.16.0.0", 12, "PRIVATE_NETWORK"],
    ["192.0.0.0", 24, "LOCALHOST", true],
    ["192.0.2.0", 24, "DOCUMENTATION"],
    ["192.88.99.0", 24, "INTERNET"],
    ["192.168.0.0", 16, "PRIVATE_NETWORK"],
    ["198.18.0.0", 15, "PRIVATE_NETWORK", true],
    ["198.51.100.0", 24, "DOCUMENTATION"],
    ["203.0.113.0", 24, "DOCUMENTATION"],
    ["224.0.0", 4, "INTERNET"],
    ["233.252.0.0", 24, "DOCUMENTATION"],
    ["240.0.0.0", 4, "INTERNET"],
    ["255.255.255.255", 32, "SUBNET"]
];