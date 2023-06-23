import { describe, expect, test } from "vitest";
import { MACAddress } from "../../lib/address/mac";

describe("MAC Address", () => {
    test("toString", () => {
        let addr = "fe-00-32-43-00-e1";
        let buf = Buffer.from("fe00324300e1", "hex");
        expect(new MACAddress(buf).toString("-")).eq(addr)
    })
    test("parser", () => {
        let addr = "fe-00-32-43-00-e1";
        let mac = new MACAddress(addr);
        expect(mac.toString("-") == addr)
    })
})