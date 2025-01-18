import { describe, expect, test } from "vitest";
import { INT16, INT32, INT64, INT8, SLICE, UINT16, UINT32, UINT64, UINT8, defineStruct } from "../../lib/binary/struct/";

function __fromHex(hex: string): Uint8Array {
    let length = Math.floor(hex.length / 2);
    let buf = new Uint8Array(length);

    let i = 0;

    if (length & 1) {
        buf[i++] = parseInt(hex.substring(0, 1), 16);
    }

    for (i; i < hex.length; i += 2) {
        buf[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }

    return buf;
}
function __toHex(buf: Uint8Array): string {
    let str = ""
    for (let i = 0; i < buf.byteLength; i++) {
        str += buf[i].toString(16).padStart(2, "0")
    }
    return str
}

describe("Buffer based struct", () => {

    test("First test", () => {

        const struct = defineStruct({
            version: UINT8(4),
            ihl: UINT8(4),
            flags: UINT16(3),
            fragOffset: UINT16(9),
            pad: UINT16(4),
            slice: SLICE
        })

        let st = struct.from(__fromHex("4feff090"));
        expect(st.get("version")).eq(4)
        expect(st.get("ihl")).eq(15)
        expect(st.get("flags")).eq(7)
        expect(st.get("fragOffset")).eq(0x0ff)
        expect(st.get("pad")).eq(0)
        expect(__toHex(st.get("slice"))).eq("90")
        let sliceText = "Hello World";
        st.set("slice", Buffer.from(sliceText, "ascii"))
        expect(Buffer.from(st.get("slice")).toString("ascii")).eq(sliceText)

        st.set("version", 6)
        expect(st.get("version")).eq(6)
        expect(st.get("ihl")).eq(15)
        st.set("ihl", 2)
        expect(st.get("version")).eq(6)
        st.set("fragOffset", 0xa)
        expect(st.get("fragOffset")).eq(0xa)
        expect(st.get("flags")).eq(7)
        st.set("flags", 4)
        expect(st.get("fragOffset")).eq(0xa)
        expect(st.get("flags")).eq(0x4)
        return;
    })

    test("define Struct #1", () => {
        expect(() => defineStruct({
            slice: SLICE,
            uint: UINT32
        })).toThrow()
    })

    test("define Struct #2", () => {
        expect(() => defineStruct({
            uint: UINT32,
            slice: SLICE(21)
        })).toThrow();

        let struct = defineStruct({
            uint2: UINT8(2),
            int2: INT8(2),
            pad: INT8(4),
        })

        expect(struct.getMinSize()).toEqual(1);

        expect(() => defineStruct({
            flags: UINT16(3),
            fragOffset: UINT16(13),
        })).not.toThrow();

        expect(UINT8.bitLength).toBe(8)

        expect(UINT8.getter == UINT8(2).getter).toEqual(true)
    })

    test("create Struct #1", () => {
        let createdStruct = defineStruct({
            uint: UINT32,
            int: INT32,
        }).create({
            uint: 100,
            int: -100
        });

        expect(createdStruct.get("uint")).toEqual(100);

        createdStruct.set("uint", 10)
        expect(createdStruct.get("uint")).toEqual(10);

        createdStruct.set("int", 10)
        expect(createdStruct.get("int")).toEqual(10);

        createdStruct.set("int", -10)
        expect(createdStruct.get("int")).toEqual(-10);

        expect(createdStruct.getMinSize()).toEqual((32 * 2) / 8);
    });

    test("create Struct #2", () => {
        let createdStruct = defineStruct({
            int: INT8,
            uint: UINT8,
            slice: SLICE
        }).from(__fromHex("ffff1111"))

        expect(createdStruct.getMinSize()).toEqual(2)

        expect(createdStruct.get("int")).toEqual(-127)
        expect(createdStruct.get("uint")).toEqual(255)
        expect(createdStruct.get("slice").length * 8).toEqual(16)

        createdStruct.set("slice", __fromHex("ff"))
        expect(createdStruct.get("slice").length * 8).toEqual(8)
    });

    test("create Struct #3", () => {
        let struct = defineStruct({
            uint: UINT16
        }), createdStruct = struct.from(__fromHex("0100" /* 0x0100*/), { bigEndian: false });
        expect(createdStruct.get("uint")).toBe(1)

        createdStruct.set("uint", __fromHex("0200" /* 0x0200*/))
        expect(createdStruct.get("uint")).toEqual(2)

        createdStruct.set("uint", 3)
        expect(createdStruct.get("uint")).toEqual(3)

        let struct2 = defineStruct({
            int: INT16
        }), createdStruct2 = struct2.from(__fromHex("0100" /* 0x0100*/), { bigEndian: false });

        expect(createdStruct2.get("int")).toBe(1)

        createdStruct2.set("int", __fromHex("0200" /* 0x0200*/))

        expect(createdStruct2.get("int")).toEqual(2)
        createdStruct2.set("int", 3)
        expect(createdStruct2.get("int")).toEqual(3)

        createdStruct2.set("int", -10)
        expect(createdStruct2.get("int")).toEqual(-10)
    })

    // test("create Struct #4", () => {
    //     let struct = defineStruct({
    //         int: INT64
    //     });


    //     expect(() => {
    //         struct.create(Buffer.alloc(0))
    //     }).toThrow()
    // })
})

describe("Value types", () => {
    test("UINT32 edge case being negative", () => {
        let value = 2234574226;
        let t = UINT32(UINT32.bitLength)
        let b = t.setter(value)
        expect(t.getter(b, { bigEndian: true, "packed": false, setDefaultValues: false })).toBe(value)
    });

    test("UINT64 & INT64", () => {
        let value = 2234574226n << 8n;
        let t = UINT64;
        let b = t.setter(value)
        expect(t.getter(b, { bigEndian: true, "packed": false, setDefaultValues: false })).toBe(value);
        
        value = value * -1n;
        t = INT64;
        b = t.setter(value);
        expect(t.getter(b, { bigEndian: true, "packed": false, setDefaultValues: false })).toBe(value);
    })
})