import { describe, expect, test } from "vitest";
import { BaseAddress, defineAddress } from "../../lib/address/base";


describe("Base Address", () => {
    test("define Base Address", () => {
        let ADDRESS = defineAddress(BaseAddress);
        expect(ADDRESS.bitLength).eq(BaseAddress.ADDRESS_LENGTH);
        expect(typeof ADDRESS.getter).eq("function")
        expect(typeof ADDRESS.setter).eq("function")
    })
})