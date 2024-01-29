import { describe, expect, test } from "vitest";
import { uint8_concat, uint8_equals, uint8_fill, uint8_fromNumber, uint8_matchLength, uint8_set } from "../../lib/binary/uint8-array";

describe("Uint8Array Helper functions", () => {
    test("uint8_equals", () => {
        let a = Buffer.from("fafa", "hex"), b = Buffer.from("fafa", "hex");

        expect(uint8_equals(a, b)).true;

        b[0] = 0xaf;

        expect(uint8_equals(a, b)).false;

        b = Buffer.concat([a, new Uint8Array(2)])
        expect(uint8_equals(a, b)).false;

        b = Buffer.alloc(0)
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

    test("uint8_fromNumber", () => {
        let expected = new Uint8Array([0xff, 0xff])
        let actual = uint8_fromNumber(0xffff, 2);

        expect(uint8_equals(
            actual,
            expected
        )).true;

        expected = new Uint8Array([0, 0, 1]);
        actual = uint8_fromNumber(1, 3);

        expect(uint8_equals(
            actual,
            expected
        )).true;
    })

    test("uint8_fill", () => {
        let expected = new Uint8Array([0xff, 0xff, 0xff]),
            actual = uint8_fill(
                new Uint8Array(3),
                0xff
            )

        expect(uint8_equals(
            actual,
            expected
        )).true;
    })

    test("uint8_matchLength", () => {
        expect(uint8_matchLength(
            new Uint8Array([0xff]),
            new Uint8Array([0xff])
        )).eq(8)
        expect(uint8_matchLength(
            new Uint8Array([0xff, 0,]),
            new Uint8Array([0xff, 1])
        )).eq(8 + 7)
        expect(uint8_matchLength(
            new Uint8Array([0xff, 0, 0xe2]),
            new Uint8Array([0xff, 0, 0xf2])
        )).eq(16 + 3)
    })
})  