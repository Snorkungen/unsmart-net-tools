import { Buffer } from "buffer";
import { describe, test, expect } from "vitest";
import { createMaskBuffer, calculateMaskBufferLength, createMask } from "../../lib/address/mask";
import { IPV4Address } from "../../lib/address/ipv4";

describe("Address Mask functionalites", () => {
    test("create mask buffer", () => {
        let buf = createMaskBuffer(IPV4Address.ADDRESS_LENGTH, 10);

        expect(buf.length).eq(IPV4Address.ADDRESS_LENGTH / 8);
        expect(buf[0]).eq(0xff)
        expect(buf[1]).eq(0xc0)
    })

    test("calculate mask buffer length", function () {
        let buf = Buffer.from("fe", "hex");
        expect(calculateMaskBufferLength(buf)).eq(7)

        buf = Buffer.from("fffc", "hex");
        expect(calculateMaskBufferLength(buf)).eq(14)

        buf = Buffer.from("f1", "hex");
        expect(calculateMaskBufferLength(buf)).eq(-1)
    })

    test("create & calculate", function () {
        let buf = createMaskBuffer(IPV4Address.ADDRESS_LENGTH, 24);
        expect(calculateMaskBufferLength(buf)).eq(24)

        buf = createMaskBuffer(IPV4Address.ADDRESS_LENGTH, 32);
        expect(calculateMaskBufferLength(buf)).eq(32);

        buf = createMaskBuffer(IPV4Address.ADDRESS_LENGTH, 0);
        expect(calculateMaskBufferLength(buf)).eq(0);
    })

    test("Address Mask", () => {
        let aMask = createMask(IPV4Address, 24);

        let addr1 = new IPV4Address("192.168.0.10"),
            addr2 = new IPV4Address("192.168.0.20");

        expect(aMask.compare(addr1, addr2)).eq(true);
        expect(aMask.length).eq(24);
        expect(aMask.mask(addr1).toString()).eq("192.168.0.0")
        expect(aMask.toAddress().toString()).eq("255.255.255.0")
    })
})