import { describe, expect, test } from "vitest";
import { INT64, INT8, SLICE, UINT16, UINT64, UINT8, defineStruct } from "../../lib/binary/struct";
import { BitArray } from "../../lib/binary";


describe("Struct behaves, like expected", () => {
    test("define Struct #1", () => {
        expect(() => defineStruct({
            slice: SLICE,
            uint: UINT64
        })).toThrow()
    })

    test("define Struct #2", () => {
        expect(() => defineStruct({
            uint: UINT64,
            slice: SLICE(21)
        })).toThrow();

        let struct = defineStruct({
            uint2: UINT8(2),
            int2: INT8(2),
        })
        
        expect(struct.getMinSize()).toEqual(4);

        expect(() => defineStruct({
            flags: UINT16(3),
            fragOffset: UINT16(13),
        })).not.toThrow();

        expect(UINT8.size).toBe(8)

        expect(UINT8.getter == UINT8(2).getter).toEqual(true)
    })

    test("create Struct #1", () => {
        let createdStruct = defineStruct({
            uint: UINT64,
            int: INT64,
        }).create({
            uint: 100,
            int: -100
        });

        expect(createdStruct.bits.size).toEqual(128);

        expect(createdStruct.get("uint")).toEqual(100);

        createdStruct.set("uint", 10)
        expect(createdStruct.get("uint")).toEqual(10);

        createdStruct.set("int", 10)
        expect(createdStruct.get("int")).toEqual(10);

        createdStruct.set("int", -10)
        expect(createdStruct.get("int")).toEqual(-10);

        expect(createdStruct.bits.size).toEqual(128);
        expect(createdStruct.getMinSize()).toEqual(128);
    });

    test("create Struct #2", () => {
        let createdStruct = defineStruct({
            int: INT8,
            uint: UINT8,
            slice: SLICE
        }).create(new BitArray("ffff1111", 16))

        expect(createdStruct.getMinSize()).toEqual(8 * 2)
        expect(createdStruct.bits.size).toEqual(8 * 2 + 16)

        expect(createdStruct.get("int")).toEqual(-127)
        expect(createdStruct.get("uint")).toEqual(255)
        expect(createdStruct.get("slice").size).toEqual(16)

        createdStruct.set("slice", new BitArray("ff", 16))
        expect(createdStruct.get("slice").size).toEqual(8)
        expect(createdStruct.bits.size).toEqual(8 * 2 + 8)
    });

    test("create Struct #3", () => {
        let struct = defineStruct({
            uint: UINT16
        }), createdStruct = struct.create(new BitArray("0000000100000000" /* 0x0100*/, 2), { bigEndian: false });
        expect(createdStruct.get("uint")).toBe(1)

        expect(
            createdStruct.set("uint", new BitArray("0000001000000000" /* 0x0200*/, 2))
        ).toEqual(16)

        expect(createdStruct.get("uint")).toEqual(2)

        expect(
            createdStruct.set("uint", 3)
        ).toEqual(16)

        expect(createdStruct.get("uint")).toEqual(3)

        let struct2 = defineStruct({
            int: UINT16
        }), createdStruct2 = struct2.create(new BitArray("0000000100000000" /* 0x0100*/, 2), { bigEndian: false });
        expect(createdStruct2.get("int")).toBe(1)

        expect(
            createdStruct2.set("int", new BitArray("0000001000000000" /* 0x0200*/, 2))
        ).toEqual(16)

        expect(createdStruct2.get("int")).toEqual(2)

        expect(
            createdStruct2.set("int", 3)
        ).toEqual(16)

        expect(createdStruct2.get("int")).toEqual(3)
    })

    test("create Struct #4", () => {
        let struct = defineStruct({
            int: INT64
        }), createdStruct = struct.create({});

        expect(struct.bits == createdStruct.bits).not.toEqual(true);

        expect(() => {
            struct.create(new BitArray(0))
        }).toThrow()
    })
});