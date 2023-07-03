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

    constructor(handler: ContactsHandler, addrFamily: AF, proto: PTO) {
        this.handler = handler;

        this.addrFamily = addrFamily;
        this.proto = proto;
    }

    recieve?: (buf: Uint8Array) => void

    send(buf: Uint8Array) {
        this.handler.recieve(this, buf);
    }

    close() {
        this.handler.closeContact(this);
    }
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
    RAW
}
