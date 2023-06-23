import { describe, test, expect } from "vitest";
import { IPV4Address } from "../../lib/address/ipv4";

describe("MAC Address", () => {
    test("toString", () => {
        let addr = "9.0.0.2";
        let buf = Buffer.from("09000002", "hex");
        expect(new IPV4Address(buf).toString()).eq(addr)
    })
    test("parser", () => {
        let addr = "192.168.30.179";
        let mac = new IPV4Address(addr);
        expect(mac.toString() == addr)
    })
})