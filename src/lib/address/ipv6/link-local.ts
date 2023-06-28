import { mutateAnd, mutateNot, mutateOr } from "../../binary/buffer-bitwise";
import { createMaskBuffer } from "../mask";
import { IPV6Address } from "./ipv6";
import { ADDRESS_TYPESV6 } from "./reserved";

/** Source <https://stackoverflow.com/a/65227338> */
const bytesArray = (n: number, len = 1): Buffer => {
    let buf = Buffer.alloc(len);
    if (!n) return buf;
    const a = []
    a.unshift(n & 255)
    while (n >= 256) {
        n = n >>> 8
        a.unshift(n & 255)
    }
    return mutateOr(buf, Buffer.from(a));
}

function createInterfaceBuf(): Buffer {
    let buf = Buffer.concat([
        bytesArray(0x0, 2),
        bytesArray(0x0420, 2), // stupid immature joke because why not
        bytesArray(Math.ceil(Math.random() * (2 ** 32) - 2), 4),
        bytesArray(Math.ceil(Math.random() * (2 ** 32) - 2), 4),
        bytesArray(Math.ceil(Math.random() * (2 ** 32) - 2), 4),
    ])

    return buf;
}

const CREATE_LINK_LOCAL_MASK = mutateNot(createMaskBuffer(IPV6Address.ADDRESS_LENGTH, ADDRESS_TYPESV6.LINK_LOCAL[1]));

export function createLinkLocalIPV6Address(): IPV6Address {
    let buf = IPV6Address.parse(ADDRESS_TYPESV6["LINK_LOCAL"][0]);
    let ifbuf = mutateAnd(createInterfaceBuf(), CREATE_LINK_LOCAL_MASK)

    mutateOr(buf, ifbuf)

    return new IPV6Address(buf);
}