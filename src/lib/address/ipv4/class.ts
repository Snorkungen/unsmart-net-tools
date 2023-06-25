import { IPV4Address } from "./ipv4";

/** 
### 2.3 Paragraph 4
Source <https://www.rfc-editor.org/rfc/rfc791>

Addresses are fixed length of four octets (32 bits).  An address
begins with a network number, followed by local address (called the
"rest" field).  There are three formats or classes of internet
addresses:  in class a, the high order bit is zero, the next 7 bits
are the network, and the last 24 bits are the local address; in
class b, the high order two bits are one-zero, the next 14 bits are
the network and the last 16 bits are the local address; in class c,
the high order three bits are one-one-zero, the next 21 bits are the
network and the last 8 bits are the local address.

### 3.2 Paragraph 5

```txt
High Order Bits   Format                           Class
---------------   -------------------------------  -----
0                 7 bits of net, 24 bits of host     a
10                14 bits of net, 16 bits of host    b
110               21 bits of net,  8 bits of host    c
111               escape to extended addressing mode
```
*/
export type IPV4AddressClass = {
    name: IPV4AddressClassNames;
    higherOrderBits: number;
    higherOrderBitLength: number;

    hostBitCount: number;

    get networkBitCount(): number;
    get maxHosts(): number;
    get maxAddresses(): number;

}

export type IPV4AddressClassNames = "A" | "B" | "C";

export const IPV4_CLASS_A = {
    name: "A",
    higherOrderBitLength: 1,
    higherOrderBits: 0,
    hostBitCount: 24,

    get networkBitCount(): number {
        return IPV4Address.ADDRESS_LENGTH - this.hostBitCount;
    },
    get maxHosts(): number {
        return 2 ** this.hostBitCount - 2;
    },
    get maxAddresses(): number {
        return 2 ** (this.networkBitCount - this.higherOrderBitLength);
    }
} as const satisfies IPV4AddressClass;

export const IPV4_CLASS_B = {
    ...IPV4_CLASS_A,
    name: "B",
    higherOrderBitLength: 2,
    higherOrderBits: 0x80, //10
    hostBitCount: 16,
} as const satisfies IPV4AddressClass;

export const IPV4_CLASS_C = {
    ...IPV4_CLASS_A,
    name: "C",
    higherOrderBitLength: 3,
    higherOrderBits: 0xc0, // 110
    hostBitCount: 8,
} as const satisfies IPV4AddressClass;

export const IPV4_CLASSESS = [
    IPV4_CLASS_A,
    IPV4_CLASS_B,
    IPV4_CLASS_C,
] as const satisfies Readonly<Array<IPV4AddressClass>>;

export function classifyIPV4Address(address: IPV4Address): IPV4AddressClass {

    for (let i = IPV4_CLASSESS.length; i > 0; i--) {
        let c = IPV4_CLASSESS[i - 1], ho = c.higherOrderBits;
        if ((address.buffer[0] & ho) == ho) {
            return c;
        }
    }

    throw new Error("failed to classify " + address.toString())
}