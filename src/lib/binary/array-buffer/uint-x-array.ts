import { BitArray } from "../binary";

export function uintArrayToBitArray(array: Uint8Array | Uint16Array | Uint32Array) {
    let bits = new BitArray([]);
    array.forEach(val => {
        let bitArray = new BitArray(0, array.BYTES_PER_ELEMENT * 8).or(new BitArray(val));
        bits.splice(bits.size, 0, bitArray)
    })

    return bits
}