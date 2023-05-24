import { BitArray } from "../../binary";
import { AddressV6, parseColonNotated } from "./address"
import { ADDRESS_TYPESV6 } from "./reserved"

const createInterfaceBits = () : BitArray => {
    let randomNumber = Math.floor(Math.random() * (2**32));
    return new BitArray(0,64).or(
        new BitArray( Math.floor(Math.random() * (2**32))).concat(
            new BitArray( Math.floor(Math.random() * (2**32)))
        )
    );
}

export function createLinkLocalAddressV6 (): AddressV6 {
    let baseBits = parseColonNotated(ADDRESS_TYPESV6["LINK_LOCAL"][0]);;
    let bits = baseBits.or(new BitArray(createInterfaceBits()));
    return new AddressV6(bits);
}