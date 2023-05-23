
// <https://www.rfc-editor.org/rfc/rfc4291.html>
// <https://www.iana.org/assignments/ipv6-multicast-addresses/ipv6-multicast-addresses.xhtml>

export const ALL_NODES_ADDRESSV6 = "FF01:0:0:0:0:0:0:1" as const;
export const ALL_ROUTERS_ADDRESSV6 = "FF01:0:0:0:0:0:0:2" as const;
export const LOOPBACK_ADDRESSV6 = "::1" as const;


// SOURCE <https://www.rfc-editor.org/rfc/rfc4291.html#section-2.4>
export const ADDRESS_TYPESV6 = {
    UNSPECIFIED: ["::", 128],
    LOOPBACK: ["::1", 128],
    MULTICAST: ["FF00::", 8],
    LINK_LOCAL: ["FE80::", 10]
} as const;