import { Encoding } from "./stringify";

export function alloc(size: number, fill: number = 0): Uint8Array {
    let buf = new Uint8Array(size);


    return buf;
}

export function from(input: Uint8Array): Uint8Array;
export function from(input: number[]): Uint8Array;
export function from(input: number, len?: number): Uint8Array;
// export function from(input: string, encoding?: Encoding): Uint8Array;
export function from(input: unknown, encoding?: Encoding | number): Uint8Array {
    if (input instanceof Uint8Array || Array.isArray(input)) {
        return new Uint8Array(input);
    } else if (typeof input == "number") {
        return fromNumber(input,
            typeof encoding == "number" ? encoding : undefined
        )
    }


    throw new Error("Could not initialize: " + Uint8Array.name)
}


/** Source <https://stackoverflow.com/a/65227338> */
export function fromNumber(n: number, len?: number): Uint8Array {
    let l = len || 1;
    let buf = alloc(l);
    if (!n) return buf;

    const a: number[] = []
    a.unshift(n & 255)
    while (n >= 256) {
        n = n >>> 8
        a.unshift(n & 255)
    }

    let aBuf = from(a);

    let diff = buf.length - aBuf.length;

    if (diff < 0) {
        if (typeof len == "number") {
            console.warn(n + ": does not fit in specified size")
            return buf;
        } else return aBuf;
    }

    buf.set(aBuf, diff)
    return buf;
}


export function concat(items: Uint8Array[]): Uint8Array {
    let len = items.reduce((sum, { byteLength }) => sum + byteLength, 0);
    let buf = alloc(len);

    let offset = 0;
    for (let item of items) {
        buf.set(item, offset);
        offset += item.byteLength;
    }

    return buf;
}