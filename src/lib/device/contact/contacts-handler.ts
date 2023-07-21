import { Buffer } from "buffer";
import { IPV4Address } from "../../address/ipv4";
import { IPV6Address } from "../../address/ipv6";
import { MACAddress } from "../../address/mac";
import { ETHERNET_HEADER, ETHER_TYPES } from "../../header/ethernet";
import { IPV4_HEADER, IPV6_HEADER } from "../../header/ip";
import { Device } from "../device";
import { Contact, ContactAddrFamily, ContactProto } from "./contact";
import { calculateChecksum } from "../../binary/checksum";
import { Interface } from "../interface";

export const UNSET_MAC_ADDRESS = new MACAddress(Buffer.alloc(MACAddress.ADDRESS_LENGTH / 8, 0));
export const UNSET_IPV4_ADDRESS = new IPV4Address(Buffer.alloc(IPV4Address.ADDRESS_LENGTH / 8, 0));
export const UNSET_IPV6_ADDRESS = new IPV6Address(Buffer.alloc(IPV6Address.ADDRESS_LENGTH / 8, 0));

export class ContactsHandler {
    contacts: Array<Contact<ContactAddrFamily, ContactProto>> = []

    constructor(private device: Device) { }

    handle(frame: typeof ETHERNET_HEADER, iface: Interface) {
        for (let contact of this.contacts) {
            if (!contact || !contact.recieve) continue;

            if (contact.addrFamily == ContactAddrFamily.RAW) {
                contact.recieve(frame.getBuffer(), iface)
            } else if (contact.addrFamily == ContactAddrFamily.IPv4) {
                if (frame.get("ethertype") != ETHER_TYPES.IPv4) continue;

                contact.recieve(frame.get("payload"), iface)
            } else if (contact.addrFamily == ContactAddrFamily.IPv6) {
                if (frame.get("ethertype") != ETHER_TYPES.IPv6) continue;

                contact.recieve(frame.get("payload"), iface)
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
                return this.recieveRAW(contact, buf);
            case ContactAddrFamily.IPv4:
                return this.recieveIPv4(contact, buf);
            case ContactAddrFamily.IPv6:
                return this.recieveIPv6(contact, buf);
        }
    }

    private recieveRAW(contact: Contact<ContactAddrFamily, ContactProto>, buf: Uint8Array) {
        let eth_hdr = ETHERNET_HEADER.from(buf);

        let saddr = eth_hdr.get("smac");

        if (saddr.toString() == UNSET_MAC_ADDRESS.toString()) {
            // send on all interfaces
            for (let iface of this.device.interfaces) {
                this.device.log(eth_hdr, iface, "SEND")
                iface.send(
                    eth_hdr.create({ smac: iface.macAddress })
                )
            }
        } else for (let iface of this.device.interfaces) {
            // send on specific interface
            if (iface.macAddress.toString() == saddr.toString()) {
                this.device.log(eth_hdr, iface, "SEND")
                return iface.send(eth_hdr);
            }
        }
    }
    private async recieveIPv4(contact: Contact<ContactAddrFamily, ContactProto>, buf: Uint8Array) {
        let ip_hdr = IPV4_HEADER.from(buf),
            saddr = ip_hdr.get("saddr"),
            daddr = ip_hdr.get("daddr");

        if (saddr.toString() == UNSET_IPV4_ADDRESS.toString()) {
            // have some special sauce to determine a suitable interface

            let iface = this.device.interfaces.find(({ ipv4Address, ipv4SubnetMask }) => ipv4Address && ipv4SubnetMask?.compare(ipv4Address, daddr));
            if (!iface) {
                iface = this.device.interfaces.find(i => i.ipv4Address);
            }
            if (!iface) {
                return; // no interface to choose from
            }

            ip_hdr.set("saddr", iface.ipv4Address!);

            // recalculate checksum
            ip_hdr.set("csum", 0);
            ip_hdr.set("csum", calculateChecksum(ip_hdr.getBuffer().subarray(0, 20)));
            this.recieveIPv4(contact, ip_hdr.getBuffer())
        } else for (let iface of this.device.interfaces) {
            if (!iface.ipv4Address || iface.ipv4Address.toString() != saddr.toString()) continue;

            if (!iface.ipv4SubnetMask?.compare(saddr, daddr)) {
                // Sanity Check Ensure daddr is the same subnet because routing not Implented
                throw new Error("Routing not implemented")
            }

            let dmac: MACAddress;

            if (saddr.toString() == daddr.toString()) {
                // destination is self
                dmac = iface.macAddress;
            } else {
                let r = await this.device.neighborTable.getDiscover(daddr);
                if (typeof r == "number") {
                    // was error return
                    throw new Error(r + "")
                }
                dmac = r.macAddress;
            }

            let eth_hdr = ETHERNET_HEADER.create({
                smac: iface.macAddress,
                dmac: dmac,
                ethertype: ETHER_TYPES.IPv4,
                payload: ip_hdr.getBuffer()
            });

            this.device.log(eth_hdr, iface, "SEND")
            return iface.send(eth_hdr);

        }
    }
    private async recieveIPv6(contact: Contact<ContactAddrFamily, ContactProto>, buf: Uint8Array) {
        let ip_hdr = IPV6_HEADER.from(buf),
            saddr = ip_hdr.get("saddr"),
            daddr = ip_hdr.get("daddr");

        if (saddr.toString() == UNSET_IPV6_ADDRESS.toString()) {
            // have some special sauce to determine a suitable interface

            let iface = this.device.interfaces.find(({ ipv6Address }) => ipv6Address && !ipv6Address.isLinkLocal());
            if (!iface) {
                iface = this.device.interfaces.find(i => i.ipv6Address);
            }
            if (!iface) {
                return; // no interface to choose from
            }

            throw new Error("UNSET IPv6 not implemented")
        } else for (let iface of this.device.interfaces) {
            if (!iface.ipv6Address || iface.ipv6Address.toString() != saddr.toString()) continue;

            // IMPORTANT I'm unsure how i want to do routing

            let dmac: MACAddress;
            if (saddr.toString() == daddr.toString()) {
                // destination is self
                dmac = iface.macAddress;
            } else {
                let r = await this.device.neighborTable.getDiscover(daddr);
                if (typeof r == "number") {
                    // was error return
                    throw new Error(r + "")
                }
                dmac = r.macAddress;
            }

            let eth_hdr = ETHERNET_HEADER.create({
                smac: iface.macAddress,
                dmac: dmac,
                ethertype: ETHER_TYPES.IPv6,
                payload: ip_hdr.getBuffer()
            });

            this.device.log(eth_hdr, iface, "SEND")
            return iface.send(eth_hdr);
        }
    }

    closeContact(contact: Contact<ContactAddrFamily, ContactProto>) {
        let i = this.contacts.indexOf(contact);
        if (i >= 0)
            delete this.contacts[i];
    }

    createContact<AF extends ContactAddrFamily, PTO extends ContactProto>(addrFamily: AF, proto: PTO): Contact<AF, PTO> {
        let contact = new Contact<AF, PTO>(this, addrFamily, proto);
        this.contacts.push(contact);
        return contact;
    }
}