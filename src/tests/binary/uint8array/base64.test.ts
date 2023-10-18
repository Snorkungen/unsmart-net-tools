import { describe, expect, test } from "vitest";
import { uint8_fromBase64, uint8_toBase64 } from "../../../lib/binary/uint8array/base64";

describe("Base64", () => {
    test("uint8_toBase64", () => {
        let runTestVec = (actual: string, expected: string) => {
            expect(
                uint8_toBase64(Buffer.from(actual, "ascii"))
            ).toBe(expected)
        }

        runTestVec("", "")
        runTestVec("f", "Zg==")
        runTestVec("fo", "Zm8=")
        runTestVec("foo", "Zm9v")
        runTestVec("foob", "Zm9vYg==")
        runTestVec("foob", "Zm9vYg==")
        runTestVec("fooba", "Zm9vYmE=")
        runTestVec("foobar", "Zm9vYmFy")
    })

    test("uint8_fromBase64", () => {
        let runTestVec = (expected: string, actual: string) => {
            expect(
                Buffer.from(uint8_fromBase64(actual))
                    .toString("base64")
            ).toBe(Buffer.from(expected, "ascii").toString("base64"))
        }

        runTestVec("", "")
        runTestVec("f", "Zg==")
        runTestVec("fo", "Zm8=")
        runTestVec("foo", "Zm9v")
        runTestVec("foob", "Zm9vYg==")
        runTestVec("foob", "Zm9vYg==")
        runTestVec("fooba", "Zm9vYmE=")
        runTestVec("foobar", "Zm9vYmFy")
    })
})