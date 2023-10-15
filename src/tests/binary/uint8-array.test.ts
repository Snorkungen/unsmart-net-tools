import { Buffer } from "buffer";
import { describe, expect, test } from "vitest";
import { uint8_concat, uint8_equals, uint8_set } from "../../lib/binary/uint8-array";

describe("Uint8Array Helper functions", () => {
    test("uint8_equals", () => {
        let a = Buffer.from("fafa", "hex"), b = Buffer.from("fafa", "hex");

        expect(uint8_equals(a, b)).true;

        b[0] = 0xaf;

        expect(uint8_equals(a, b)).false;

        b = Buffer.concat([a, new Uint8Array(2)])

        expect(uint8_equals(a, b)).false;
    })


    test("uint8_mutateSet & uint8_set", () => {
        let target = Buffer.from("ffffaa", "hex");
        let source = Buffer.alloc(2);

        let expected = Buffer.from("ff0000", "hex")

        expect(uint8_equals(
            uint8_set(target, source, 1), // uint8_set is a wrapper of uint8_mutateSet
            expected,
        )).true
    })

    test("uint8_concat", () => {

        let buffer = uint8_concat([
            new Uint8Array([0xff]),
            new Uint8Array([0xff]),
            new Uint8Array([0xaa]),
        ])

        let expected = new Uint8Array([
            0xff, 0xff, 0xaa
        ])

        expect(uint8_equals(
            buffer,
            expected
        )).true;
    })
})  