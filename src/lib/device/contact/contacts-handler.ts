import { Buffer } from "buffer";
import { IPV4Address } from "../../address/ipv4";
import { IPV6Address } from "../../address/ipv6";
import { MACAddress } from "../../address/mac";
import { ETHERNET_HEADER, ETHER_TYPES } from "../../header/ethernet";
import { IPV4_HEADER, IPV6_HEADER } from "../../header/ip";
import { Device } from "../device";
import { Contact, ContactAddrFamily, ContactProto } from "./contact";

export const UNSET_MAC_ADDRESS = new MACAddress(Buffer.alloc(MACAddress.ADDRESS_LENGTH / 8, 0));
export const UNSET_IPV4_ADDRESS = new IPV4Address(Buffer.alloc(IPV4Address.ADDRESS_LENGTH / 8, 0));
export const UNSET_IPV6_ADDRESS = new IPV6Address(Buffer.alloc(IPV6Address.ADDRESS_LENGTH / 8, 0));

export class ContactsHandler {
    contacts: Array<Contact<ContactAddrFamily, ContactProto>> = []

    constructor(private device: Device) { }

    handle(frame: typeof ETHERNET_HEADER) {
        for (let contact of this.contacts) {
            if (!contact || !contact.recieve) continue;

            if (contact.addrFamily == ContactAddrFamily.RAW) {
                contact.recieve(frame.getBuffer())
            } else if (contact.addrFamily == ContactAddrFamily.IPv4) {
                if (frame.get("ethertype") != ETHER_TYPES.IPv4) continue;

                contact.recieve(frame.get("payload"))
            } else if (contact.addrFamily == ContactAddrFamily.IPv6) {
                if (frame.get("ethertype") != ETHER_TYPES.IPv6) continue;

                contact.recieve(frame.get("payload"))
            }
        }
    }

    /** 
     Master function that does all the cool stuff
     > Contact must call this func

     This function is magic
     */
    recieve(contact: Contact<ContactAddrFamily, ContactProto>, buf: Uint8Array) {
        switch (contact.addrFamily) {
            case ContactAddrFamily.RAW:
                return this.recieveRAW(buf);
            case ContactAddrFamily.IPv4:
                return this.recieveIPv4(buf);
            case ContactAddrFamily.IPv6:
                return this.recieveIPv6(buf);
        }
    }

    private recieveRAW(buf: Uint8Array) {
        let eth_hdr = ETHERNET_HEADER.from(buf);

        let saddr = eth_hdr.get("smac");

        if (saddr.toString() == UNSET_MAC_ADDRESS.toString()) {
            // send on all interfaces
            for (let iface of this.device.interfaces) {
                iface.send(
                    eth_hdr.create({ smac: iface.macAddress })
                )
            }
        } else for (let iface of this.device.interfaces) {
            // send on specific interface
            if (iface.macAddress.toString() == saddr.toString()) return iface.send(eth_hdr);
        }
    }
    private recieveIPv4(buf: Uint8Array) {
        let ip_hdr = IPV4_HEADER.from(buf),
            saddr = ip_hdr.get("saddr"),
            daddr = ip_hdr.get("daddr");

        if (saddr.toString() == UNSET_IPV4_ADDRESS.toString()) {
            // have some special sauce to determine a suitable interface
            throw new Error("UNSET IPv4 not implemented")
        } else for (let iface of this.device.interfaces) {
            if (!iface.ipv4Address || iface.ipv4Address.toString() != saddr.toString()) continue;

            // encapsulate packet
            throw new Error("resolve destination IPv6 not implemented")
        }
    }
    private recieveIPv6(buf: Uint8Array) {
        let ip_hdr = IPV6_HEADER.from(buf),
            saddr = ip_hdr.get("saddr"),
            daddr = ip_hdr.get("daddr");

        if (saddr.toString() == UNSET_IPV6_ADDRESS.toString()) {
            // have some special sauce to determine a suitable interface
            throw new Error("UNSET IPv6 not implemented")
        } else for (let iface of this.device.interfaces) {
            if (!iface.ipv6Address || iface.ipv6Address.toString() != saddr.toString()) continue;

            // encapsulate packet
            throw new Error("resolve destination IPv6 not implemented")
        }
    }

    closeContact(contact: Contact<ContactAddrFamily, ContactProto>) {
        let i = this.contacts.indexOf(contact);
        if (i >= 0)
            delete this.contacts[i];
    }

    createContact(addrFamily: ContactAddrFamily, proto: ContactProto): Contact<typeof addrFamily, typeof proto> {
        let contact = new Contact(this, addrFamily, proto);
        this.contacts.push(contact);
        return contact;
    }
}