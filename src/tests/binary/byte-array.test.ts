import { describe, expect, test } from "vitest";
import { ByteArray } from "../../lib/binary/byte-array";

describe("Byte Array", () => {

    test("create ByteArray; String", () => {
        let bytes = new ByteArray("ff 00", 16)
        expect(bytes.byteCount).toEqual(2)

        bytes = new ByteArray("1111 1111 0000 0000", 2)
        expect(bytes.byteCount).toEqual(2)
    })

    test("create ByteArray; Number", () => {
        let bytes = new ByteArray(0, 2)
        expect(bytes.byteCount).toEqual(2)

        bytes = new ByteArray(1, 2)
        expect(bytes.byteCount).toEqual(2)

        bytes = new ByteArray(2 ** 16 - 1);
        expect(bytes.byteCount).toEqual(2)
    })

    test("create ByteArray; ByteArray, UintArray", () => {
        let bytes = new ByteArray(new Uint8Array([0, 0]))
        bytes = new ByteArray(bytes);
        expect(bytes.byteCount).toEqual(2)
    })

    test("to\”XX\” methods", () => {
        let bytes = new ByteArray("ff", 16);
        expect(bytes.toNumber()).toEqual(255)
        expect(bytes.toString(2)).toEqual("11111111")
        expect(bytes.toString(16)).toEqual("ff")

        bytes = new ByteArray(654);
        expect(bytes.toNumber()).toEqual(654)
    })

    test("Slice", () => {
        let bytes = new ByteArray("8010", 16);
        bytes = bytes.slice(0, 1)
        expect(bytes.toString(16)).toBe("80")
    })

    test("Splice", () => {
        let bytes = new ByteArray("8010", 16);
        expect(bytes.splice(0, 1).toString(16)).toBe("80")

        expect(bytes.toString(16)).toBe("10")

        // console.log(bytes)
        bytes.splice(0, 0, new ByteArray("10", 16))
        // console.log(bytes)
        expect(bytes.toString(16)).toBe("1010")

        bytes.splice(bytes.byteCount, 0, new ByteArray("ff", 16));
        expect(bytes.toString(16)).toBe("1010ff")
    })

    test("Concat", () => {
        let bytes = new ByteArray("8010", 16);
        expect(bytes.concat(new ByteArray("ff", 16)).toString(16)).toBe("8010ff")
    })

    describe("Bit Operation", () => {

        test("OR", () => {
            expect(new ByteArray(8).or(new ByteArray(2)).toNumber()).toEqual(10);
            expect(new ByteArray(256).or(new ByteArray(255)).toNumber()).toEqual(511);
            expect(new ByteArray("ff00ff", 16).or(new ByteArray("00ff00",16)).toString()).equals("ffffff")
        })

        test("XOR", () => {
            expect(new ByteArray(8).xor(new ByteArray(2)).toNumber()).toEqual(10);
            expect(new ByteArray(255).xor(new ByteArray(15)).toNumber()).toEqual(240);
            expect(new ByteArray("ffff", 16).xor(new ByteArray("ff00",16)).toString()).equals("00ff")
        })
        
        test("AND", () => {            
            expect(new ByteArray(8).and(new ByteArray(2)).toNumber()).toEqual(0);
            expect(new ByteArray(255).and(new ByteArray(15)).toNumber()).toEqual(15);
            expect(new ByteArray("ffff", 16).and(new ByteArray("ff00",16)).toString()).equals("ff00")
        })

        test("NOT", () => {
            expect(new ByteArray(255).not().toNumber()).equal(0)
            expect(new ByteArray(256).not().toString(16)).equal("feff")
        })
    })
})