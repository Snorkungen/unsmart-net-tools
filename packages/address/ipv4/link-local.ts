import { IPV4Address, reservedAddresses } from "../ipv4";

const LINK_LOCAL_ENTRY = reservedAddresses.find(([, , scope]) => scope == "LINK_LOCAL")!

export function createLinkLocalIPV4Address(): IPV4Address {
    let buf = IPV4Address.parse(LINK_LOCAL_ENTRY[0])

    buf[2] = Math.floor(Math.random() * (256));
    buf[3] = Math.ceil(Math.random() * (254));

    return new IPV4Address(buf);
}