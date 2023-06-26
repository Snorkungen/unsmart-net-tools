import { describe, expect, test } from "vitest";
import { INT16, INT64, INT8, SLICE, Struct, UINT16, UINT64, UINT8, defineStruct } from "../../lib/binary/struct/";
import { ARRAY, STRUCT } from "../../lib/binary/struct/more-value-types";

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

        let st = struct.create(Buffer.from("4feff090", "hex"));
        expect(st.get("version")).eq(4)
        expect(st.get("ihl")).eq(15)
        expect(st.get("flags")).eq(7)
        expect(st.get("fragOffset")).eq(0x0ff)
        expect(st.get("pad")).eq(0)
        expect(st.get("slice").toString("hex")).eq(Buffer.from("90", "hex").toString("hex"))
        let sliceText = "Hello World";
        st.set("slice", Buffer.from(sliceText, "ascii"))
        expect(st.get("slice").toString("ascii")).eq(sliceText)

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
            uint: UINT64,
            int: INT64,
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

        expect(createdStruct.getMinSize()).toEqual(128 / 8);
    });

    test("create Struct #2", () => {
        let createdStruct = defineStruct({
            int: INT8,
            uint: UINT8,
            slice: SLICE
        }).create(Buffer.from("ffff1111", "hex"))

        expect(createdStruct.getMinSize()).toEqual(2)

        expect(createdStruct.get("int")).toEqual(-127)
        expect(createdStruct.get("uint")).toEqual(255)
        expect(createdStruct.get("slice").length * 8).toEqual(16)

        createdStruct.set("slice", Buffer.from("ff", "hex"))
        expect(createdStruct.get("slice").length * 8).toEqual(8)
    });

    test("create Struct #3", () => {
        let struct = defineStruct({
            uint: UINT16
        }), createdStruct = struct.create(Buffer.from("0100" /* 0x0100*/, "hex"), { bigEndian: false });
        expect(createdStruct.get("uint")).toBe(1)

        createdStruct.set("uint", Buffer.from("0200" /* 0x0200*/, "hex"))
        expect(createdStruct.get("uint")).toEqual(2)

        createdStruct.set("uint", 3)
        expect(createdStruct.get("uint")).toEqual(3)

        let struct2 = defineStruct({
            int: INT16
        }), createdStruct2 = struct2.create(Buffer.from("0100" /* 0x0100*/, "hex"), { bigEndian: false });

        expect(createdStruct2.get("int")).toBe(1)

        createdStruct2.set("int", Buffer.from("0200" /* 0x0200*/, "hex"))

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

describe("more struct types", () => {
    test("ARRAY", () => {
        let x = ARRAY(UINT16, 2)
        let buf = Buffer.alloc(4);
        buf[1] = 0xc0;

        let options = {
            packed: false,
            bigEndian: true,
            "setDefaultValues": false
        }

        let got = x.getter(buf, options)
        expect(got).deep.eq([0xc0, 0])
        got[0] = 0xfe

        buf = x.setter(got, options)
        got = x.getter(buf, options)
        expect(got).deep.eq([0xfe, 0])
    })

    test("STRUCT", () => {
        const SUB_STRUCT = defineStruct({
            uint: UINT16,
            int: INT16
        });

        const TEST_STRUCT = defineStruct({
            uint: UINT16,
            struct: STRUCT(SUB_STRUCT),
            int: INT8,
        });

        let st = TEST_STRUCT.create({
            uint: 8,
            struct: SUB_STRUCT.create({
                uint: 0xcf,
                int: -1
            }),
            int: -100
        })

        
        expect (st.get("uint")).eq(8);
        expect(st.get("int")).eq(-100);
        expect(st.get("struct").get("uint")).eq(0xcf)
        expect(st.get("struct").get("int")).eq(-1)
        
        let got = st.get("struct")
        got.set("int", -2);
        st.set("struct", got);
        expect(st.get("struct").get("int")).eq(-2)
    })
})