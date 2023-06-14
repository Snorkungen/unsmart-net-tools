import { describe, expect, test } from 'vitest'
import { BitArray, base64_decode, base64_encode } from '../../lib/binary'

describe("Base 64 encode & decode", () => {

    test("Encode", () => {
        let target = btoa("AB")
        let bits = new BitArray(0,8).or(new BitArray(65)).concat(new BitArray(0,8).or(new BitArray(66)));
       
        let encoded = base64_encode(bits);
        expect(target).toEqual(encoded)

        let target2 = btoa("M");
        let bits2 = new BitArray(0,8).or(new BitArray(77));
        let encoded2 = base64_encode(bits2);

        expect(target2).toEqual(encoded2)
    });

    test("Decode", () => {
        let target =new BitArray(0,8).or(new BitArray(65)).concat(new BitArray(0,8).or(new BitArray(66)));
        let str = btoa("AB")
        let decoded = base64_decode(str)
        expect(target.toString()).toEqual(decoded.toString())

        let target2 = new BitArray(0,8).or(new BitArray(77));
        let str2 = btoa("M");
        let decoded2 = base64_decode(str2);
        expect(target2.toString()).toEqual(decoded2.toString())
    })

    test("Decode & Encode", () => {
        [
            "Ma",
            "light work",
            encodeURIComponent("He realized there had been several deaths on this road, but his concern rose when he saw the exact number."),
            encodeURIComponent("She did her best to help him."),
            encodeURIComponent("The sunblock was handed to the girl before practice, but the burned skin was proof she did not apply it."),
            encodeURIComponent("His son quipped that power bars were nothing more than adult candy bars."),
            encodeURIComponent("The truth is that you pay for your lifestyle in hours."),
            encodeURIComponent("Please put on these earmuffs because, I can't you hear.")
        ].forEach((text) => {
            let enc = btoa(text)
            let decoded = base64_decode(enc);
            let encoded = base64_encode(decoded);
            let dec = atob(encoded)

            expect(enc).toBe(encoded);
            expect(text).toBe(dec);
        })
    })
});