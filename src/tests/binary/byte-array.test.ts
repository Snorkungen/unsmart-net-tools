import { describe, expect, test } from "vitest";
import { ByteArray } from "../../lib/binary/byte-array";

describe("Byte Array", () => {

    test("create ByteArray; String", () => {
        let bytes = new ByteArray("ff 00", 16)
        expect(bytes.size).toEqual(2)

        bytes = new ByteArray("1111 1111 0000 0000", 2)
        expect(bytes.size).toEqual(2)
    })

    test("create ByteArray; Number", () => {
        let bytes = new ByteArray(0, 2)
        expect(bytes.size).toEqual(2)

        bytes = new ByteArray(1, 2)
        expect(bytes.size).toEqual(2)

        bytes = new ByteArray(2 ** 16 - 1);
        expect(bytes.size).toEqual(2)
    })

    test("create ByteArray; ByteArray, UintArray", () => {
        let bytes = new ByteArray(new Uint8Array([0, 0]))
        bytes = new ByteArray(bytes);
        expect(bytes.size).toEqual(2)
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
        let bytes = new ByteArray("8010",16);
        bytes = bytes.slice(0,1)
        expect(bytes.toString(16)).toBe("80")
    })

    test("Splice", () => {
        let bytes = new ByteArray("8010",16);
        expect(bytes.splice(0,1).toString(16)).toBe("80")
        
        expect(bytes.toString(16)).toBe("10")
        
        // console.log(bytes)
        bytes.splice(0, 0, new ByteArray("10",16))
        // console.log(bytes)
        expect(bytes.toString(16)).toBe("1010")

        bytes.splice(bytes.size,0 , new ByteArray("ff",16));
        expect(bytes.toString(16)).toBe("1010ff")
    })

    test("Concat", () => {
        let bytes = new ByteArray("8010",16);
        expect (bytes.concat(new ByteArray("ff", 16)).toString(16)).toBe("8010ff")
    })
})