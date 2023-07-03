import { BaseAddress } from "../../address/base";
import { IPV4Address } from "../../address/ipv4";
import { MACAddress } from "../../address/mac";
import { ContactsHandler } from "./contacts-handler";

/**
 * # Contact
 * > this is inpired by sockets but calling it something else due to this not being a socket
 * 
 */
export class Contact<AF extends ContactAddrFamily, PTO extends ContactProto>{
    readonly addrFamily: AF;
    readonly proto: PTO;

    readonly address?: ContactAddress<AF, PTO>;

    constructor(handler: ContactsHandler, addrFamily: AF, proto: PTO) {
        this.addrFamily = addrFamily;
        this.proto = proto;
    }

    
};

enum ContactAddrFamily {
    /** ```RAW``` refers to contact living on OSI L2  */
    RAW,
    /** ```IPv4``` refers to contact living on OSI L3 IPv4  */
    IPv4,
    /** ```IPv6``` refers to contact living on OSI L3 IPv6  */
    IPv6
}

enum ContactProto {
    /** ```RAW``` refers to using the raw protocol chosen in ```ContactAddrFamily``` */
    RAW
}

type ContactAddress<AF extends ContactAddrFamily, PTO extends ContactProto> =
    AF extends ContactAddrFamily.RAW ? ContactAddressRaw
    : AF extends ContactAddrFamily.IPv4 ? ContactAddressIPv4Raw // extend when adding session Layer
    : AF extends ContactAddrFamily.IPv6 ? ContactAddressIPv6Raw

    : ContactBaseAddress

interface ContactBaseAddress {
    addr: BaseAddress;
    port?: number;
}
interface ContactAddressRaw extends ContactBaseAddress { addr: MACAddress; }
interface ContactAddressIPv4Raw extends ContactBaseAddress { addr: IPV4Address; }
interface ContactAddressIPv6Raw extends ContactBaseAddress { addr: IPV4Address; }