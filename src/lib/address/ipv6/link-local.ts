import { mutateAnd, mutateNot, mutateOr } from "../../binary/buffer-bitwise";
import { bufferFromNumber } from "../../binary/buffer-from-number";
import { createMaskBuffer } from "../mask";
import { IPV6Address } from "./ipv6";
import { ADDRESS_TYPESV6 } from "./reserved";
import { uint8_concat } from "../../binary/uint8-array";


function createInterfaceBuf(): Uint8Array {
    let buf = uint8_concat([
        bufferFromNumber(0x0, 2),
        bufferFromNumber(0x0420, 2), // stupid immature joke because why not
        bufferFromNumber(Math.ceil(Math.random() * (2 ** 32) - 2), 4),
        bufferFromNumber(Math.ceil(Math.random() * (2 ** 32) - 2), 4),
        bufferFromNumber(Math.ceil(Math.random() * (2 ** 32) - 2), 4),
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