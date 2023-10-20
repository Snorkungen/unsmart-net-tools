import { IPV4Address } from "../../address/ipv4";
import { IPV6Address } from "../../address/ipv6";
import { Interface } from "../interface";
import { ContactsHandler } from "./contacts-handler";

/**
 * # Contact
 * > this is inpired by sockets but calling it something else due to this not being a socket
 * 
 */
export class Contact<AF extends ContactAddrFamily, PTO extends ContactProto>{
    readonly addrFamily: AF;
    readonly proto: PTO;
    private handler: ContactsHandler;

    /** either implicit or explicit */
    address?: ContactAddress;

    constructor(handler: ContactsHandler, addrFamily: AF, proto: PTO) {
        this.handler = handler;

        this.addrFamily = addrFamily;
        this.proto = proto;
    }

    recieve?: (buf: Uint8Array, iface: Interface) => void

    send(buf: Uint8Array) {
        this.handler.recieve(this, buf);
    }

    close() {
        this.handler.closeContact(this);
    }

    // this is me hallucinating some garbage

    /** 
     * This method tells the contacts-handler to forward stuff to -> this.recieveFrom
     * \
     * Only applies to -
     * {@link ContactProto.UDP}
     * 
     * @returns boolean - `true` for success and `false` for failure
    */
    bind(caddr: ContactAddress): boolean {
        return this.handler.bindContact(this, caddr);
    }

    /**  */
    sendTo(caddr: ContactAddress, data: Uint8Array): boolean {
        if (
            this.addrFamily == ContactAddrFamily.RAW
            || this.proto == ContactProto.RAW
        ) {
            console.warn("incorrect contact type")
            return false;
        }

        if (
            this.addrFamily != caddr.addrFamily
        ) {
            console.warn("incorrect contact type: address family mismatch")
            return false;
        }

        if (!this.address) {
            if (!this.handler.bindContact(this)) {
                console.warn("failed to implicitily bind contact")
                return false;
            }
        }

        if (!this.address) {
            throw "This should not get called";
        }

        // 1st only handle UDP IPv4
        if (this.addrFamily != ContactAddrFamily.IPv4 || this.proto != ContactProto.UDP) {
            throw "This is experimental right now and only certain functionalites are being explored"
        }

        // hand the rest of the sending to the contacts-handler
        this.handler.recieve(this, data, caddr)
        return true;
    }

    recieveFrom?: (caddr: ContactAddress, data: Uint8Array) => void;
};

export enum ContactAddrFamily {
    /** ```RAW``` refers to contact living on OSI L2  */
    RAW,
    /** ```IPv4``` refers to contact living on OSI L3 IPv4  */
    IPv4,
    /** ```IPv6``` refers to contact living on OSI L3 IPv6  */
    IPv6
}

export enum ContactProto {
    /** ```RAW``` refers to using the raw protocol chosen in ```ContactAddrFamily``` */
    RAW,
    /** UDP Packets theres no need to be obtuse */
    UDP,
}

export type ContactAddress = {
    port: number;
    proto: ContactProto.UDP;
} & ({
    addrFamily: ContactAddrFamily.IPv4;
    address: IPV4Address;
} | {
    addrFamily: ContactAddrFamily.IPv6;
    address: IPV6Address;
})