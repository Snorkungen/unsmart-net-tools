// 
// Source <https://www.rfc-editor.org/rfc/rfc791>


import { BitArray } from "../../binary";
import { AddressV4 } from "./v4";

/*
    2.3 Paragraph 4
    Addresses are fixed length of four octets (32 bits).  An address
    begins with a network number, followed by local address (called the
    "rest" field).  There are three formats or classes of internet
    addresses:  in class a, the high order bit is zero, the next 7 bits
    are the network, and the last 24 bits are the local address; in
    class b, the high order two bits are one-zero, the next 14 bits are
    the network and the last 16 bits are the local address; in class c,
    the high order three bits are one-one-zero, the next 21 bits are the
    network and the last 8 bits are the local address.


    3.2 Paragraph 5
    High Order Bits   Format                           Class
    ---------------   -------------------------------  -----
    0               7 bits of net, 24 bits of host    a
    10              14 bits of net, 16 bits of host    b
    110             21 bits of net,  8 bits of host    c
    111             escape to extended addressing mode
*/

type ClassV4Name = "A" | "B" | "C"

export class ClassAddressV4 {
    maxHosts: number;
    maxAdresses: number;

    constructor(
        public name: ClassV4Name,
        private higherOrderBitArray: BitArray,
        public hostBitCount: number,
        public networkBitCount = 32 - hostBitCount
    ) {

        this.maxHosts = 2 ** hostBitCount - 2;
        this.maxAdresses = 2 ** (networkBitCount - higherOrderBitArray.size)

    }

    /**
     * Tests if the given address is of the specific address
     * @param AddressV4 
     * @returns boolean
     */
    test(address: AddressV4) {
        let addressHOBits = address.bits.slice(0, this.higherOrderBitArray.size);
        return addressHOBits.toString() == this.higherOrderBitArray.toString()
    }
}


export const CLASSV4_A = new ClassAddressV4(
    "A",
    new BitArray("0", 2),
    24
);

export const CLASSV4_B = new ClassAddressV4(
    "B",
    new BitArray("10", 2),
    16
);

export const CLASSV4_C = new ClassAddressV4(
    "C",
    new BitArray("110", 2),
    8
);


export const classesV4 = [
    CLASSV4_A,
    CLASSV4_B,
    CLASSV4_C
]