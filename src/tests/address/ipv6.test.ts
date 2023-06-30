import { Buffer } from "buffer";
import { describe, test, expect } from "vitest";
import { ADDRESS_TYPESV6, IPV6Address } from "../../lib/address/ipv6";
import { createLinkLocalIPV6Address } from "../../lib/address/ipv6/link-local";
import { createMask } from "../../lib/address/mask";

describe("IPV6 Address", () => {
    test("toString", () => {
        let addr = "ff56:9909:ed01:8888:c438:0600:a1ac:ba00";
        let buf = Buffer.from("ff569909ed018888c4380600a1acba00", "hex");
        expect(new IPV6Address(buf).toString(-1)).eq(addr)
    })
    test("parser", () => {
        let addr = "fe80::c438:600:a1ac:ba00";
        let ipv6 = new IPV6Address(addr);
        expect(ipv6.toString(-1) == addr)
    })

    test("toString & parser", () => {
        let addr = "ff02::"
        let ipv6 = new IPV6Address("ff02::");
        expect(ipv6.toString(4)).eq(addr)
        expect(ipv6.toString(0)).eq("ff02:0:0:0:0:0:0:0")
        expect(ipv6.toString(-1)).eq("ff02:0000:0000:0000:0000:0000:0000:0000")
    })

    test ("is X", () => {
        let llAddr = new IPV6Address("fe80::c438:600:a1ac:ba00");
        expect(llAddr.isLinkLocal()).eq(true);

        let mcAddr = new IPV6Address("ff02::1");
        expect(mcAddr.isMulticast()).eq(true)

        let loopAddr = new IPV6Address("::1");
        expect(loopAddr.isLoopback()).eq(true)
    })

    test("create link local", () => {
        let llNetAddress = new IPV6Address(ADDRESS_TYPESV6.LINK_LOCAL[0])
        
        for (let i = 0; i< 1_000; i++) {
            let llAddr = createLinkLocalIPV6Address();
            expect(llNetAddress.toString(-1) ).not.eq(llAddr.toString(-1))
            expect(llAddr.isLinkLocal(), "Created Address not link-local ").eq(true)
        }

    })

    
})