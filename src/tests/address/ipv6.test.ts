import { describe, test, expect } from "vitest";
import { IPV6Address } from "../../lib/address/ipv6";

describe("MAC Address", () => {
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
})