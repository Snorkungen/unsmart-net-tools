import { describe, expect, test } from "vitest";
import { calculateChecksum } from "../../lib/binary/checksum";

/**
 * Test stolen from **stackoverflow** <https://stackoverflow.com/a/4114507>
 */

describe("Checksum", () => {
    test("Simplest Valid Value", () => {
        let buf = Buffer.alloc(1);
        let expected = 0xffff;
        let actual = calculateChecksum(buf);

        expect(actual).toEqual(expected)
    })

    test("Valid Multi Byte Extrema", () => {
        let buf = Buffer.alloc(2);
        buf[0] = 0x00, buf[1] = 0xff;

        let expected = 0xff00;
        let actual = calculateChecksum(buf);

        expect(actual).toEqual(expected);
    })

    test("Valid Example Message", () => {
        let buf = new Uint8Array([0xe3, 0x4f, 0x23, 0x96, 0x44, 0x27, 0x99, 0xf3]);

        let expected = 0x1aff;
        let actual = calculateChecksum(buf);

        expect(actual).toEqual(expected)
    })

    test("Valid Example Even Message With Carry From RFC1071", () => {
        let buf = new Uint8Array([0x00, 0x01, 0xf2, 0x03, 0xf4, 0xf5, 0xf6, 0xf7])

        let expected = 0x220d;
        let actual = calculateChecksum(buf);

        expect(actual).toBe(expected)
    })
})