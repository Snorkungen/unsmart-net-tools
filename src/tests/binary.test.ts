import { describe, expect, test } from 'vitest'
import { BitArray } from '../lib/binary'

describe("Binary parses input correctly", () => {
    test('number', () => {
        let bits = new BitArray(10);
        expect(bits.toNumber()).toBe(10)
        bits = new BitArray(5);
        expect(bits.toString(2)).toBe("101")
    })

    test("bit string", () => {
        let bits = new BitArray("1111", 2);
        expect(bits.toString(2)).toBe("1111")

        bits = new BitArray("1111", 2);
        expect(bits.toString(2)).toBe("1111")
    })

    test("hex string", () => {
        let bits = new BitArray("FF", 16);
        expect(bits.toString(16)).toBe("ff")

        bits = new BitArray("f2", 16);
        expect(bits.toString(2)).toBe("11110010")

    })
})

describe("bitwise operations", () => {
    test("or", () => {
        let bitArray1 = new BitArray(10),   // 1010
            bitArray2 = new BitArray(5);    //  101

        expect(bitArray1.or(bitArray2).toString(2)).toBe("1111");
        expect(bitArray2.or(bitArray1).toString(2)).toBe("1111");
    })

    test("xor", () => {
        let bitArray1 = new BitArray(7),    // 111
            bitArray2 = new BitArray(5);    // 101

        expect(bitArray1.xor(bitArray2).toString(2)).toBe("010");
        expect(bitArray2.xor(bitArray1).toString(2)).toBe("010");
    })

    test("and", () => {
        let bitArray1 = new BitArray(14),   // 1110
            bitArray2 = new BitArray(5);    //  101

        expect(bitArray1.and(bitArray2).toString(2)).toBe("0100");
        expect(bitArray2.and(bitArray1).toString(2)).toBe("0100");
    })

    test("not", () => {
        let bitArray = new BitArray(10);    // 1010
        expect(bitArray.not().toString(2)).toBe("0101")
    })
});

describe("Slice & Dice", () => {
    let bitArray = new BitArray("0011001101", 2);

    test("slice", () => {
        let slice = bitArray.slice(0, 3),
            expected = new BitArray("001", 2);
        expect(slice.toString()).toBe(expected.toString())

        slice = bitArray.slice(1), expected = new BitArray("011001101", 2);

        expect(slice.toString(2)).toBe(expected.toString(2))
    })

    test("concat", () => {
        let concatenated = bitArray.concat(new BitArray("101", 2)),
            expected = new BitArray("0011001101101", 2)

        expect(concatenated.toString(2)).toBe(expected.toString(2))
    })


})
