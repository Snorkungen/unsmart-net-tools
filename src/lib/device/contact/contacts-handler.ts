import { IPV4Address } from "../../address/ipv4";
import { IPV6Address } from "../../address/ipv6";
import { MACAddress } from "../../address/mac";
import { ETHERNET_HEADER, ETHER_TYPES } from "../../header/ethernet";
import { IPV4_HEADER, IPV4_PSEUDO_HEADER, IPV6_HEADER, PROTOCOLS, createIPV4Header } from "../../header/ip";
import { Device } from "../device";
import { Contact, ContactAddrFamily, ContactAddress, ContactProto } from "./contact";
import { calculateChecksum } from "../../binary/checksum";
import { Interface } from "../interface";
import { uint8_equals } from "../../binary/uint8-array";
import { UDP_HEADER, createUDPHeader } from "../../header/udp";

export const UNSET_MAC_ADDRESS = new MACAddress(new Uint8Array(MACAddress.ADDRESS_LENGTH / 8));
export const UNSET_IPV4_ADDRESS = new IPV4Address(new Uint8Array(IPV4Address.ADDRESS_LENGTH / 8));
export const UNSET_IPV6_ADDRESS = new IPV6Address(new Uint8Array(IPV6Address.ADDRESS_LENGTH / 8));

export class ContactsHandler {
    contacts: Array<Contact<ContactAddrFamily, ContactProto>> = []

    // lazy solution
    portN = 2000

    constructor(private device: Device) { }

    handle(frame: typeof ETHERNET_HEADER, iface: Interface) {
        // handleRAW:
        for (let contact of this.contacts) {
            if (!contact || !contact.recieve || contact.proto != ContactProto.RAW) continue;

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

        // in future maybe have a better more targeted "Data Structure"

        // read frame and parse

        if (frame.get("ethertype") == ETHER_TYPES.IPv4) {
            this.handleIPV4(IPV4_HEADER.from(frame.get("payload")), iface);
        } else if (frame.get("ethertype") == ETHER_TYPES.IPv6) {
            this.handleIPV6(IPV6_HEADER.from(frame.get("payload")), iface);
        }

    }

    private handleIPV4(ipHdr: typeof IPV4_HEADER, iface: Interface) {
        // check protocol

        // this is cool and all but i need some type of error handling IE "ICMP ERRORS"

        if (ipHdr.get("proto") == PROTOCOLS.UDP) {
            let udpHdr = UDP_HEADER.from(ipHdr.getBuffer().subarray(
                ipHdr.get("ihl") * 4
            ));

            // validate checksum

            // loop through and do stuff

            for (let contact of this.contacts) {
                if (!contact ||
                    !contact.address ||
                    contact.address.addrFamily != ContactAddrFamily.IPv4 ||
                    contact.address.proto != ContactProto.UDP ||
                    !contact.recieveFrom) {
                    continue;
                }

                // check dport
                if (contact.address.port != udpHdr.get("dport")) {
                    continue;
                }

                if (
                    !uint8_equals(UNSET_IPV4_ADDRESS.buffer, contact.address.address.buffer) &&
                    !uint8_equals(ipHdr.get("daddr").buffer, contact.address.address.buffer)
                ) {
                    continue
                }

                contact.recieveFrom({
                    address: ipHdr.get("saddr"),
                    addrFamily: ContactAddrFamily.IPv4,
                    port: udpHdr.get("sport"),
                    proto: ContactProto.UDP,
                }, udpHdr.get("payload"));


                return; // only 1 contact should be recieving protocol packets
            }
        }

    }

    private handleIPV6(ipHdr: typeof IPV6_HEADER, iface: Interface) {
        // This is not tested due to sending part still incomplete 
        // Due to my lack of understaing of ipv6 routing

        // this is cool and all but i need some type of error handling IE "ICMP ERRORS"

        if (ipHdr.get("nextHeader") == PROTOCOLS.UDP) {
            let udpHdr = UDP_HEADER.from(ipHdr.get("payload"));

            // validate checksum

            // loop through and do stuff

            for (let contact of this.contacts) {
                if (!contact ||
                    !contact.address ||
                    contact.address.addrFamily != ContactAddrFamily.IPv6 ||
                    contact.address.proto != ContactProto.UDP ||
                    !contact.recieveFrom) {
                    continue;
                }

                // check dport
                if (contact.address.port != udpHdr.get("dport")) {
                    continue;
                }

                if (
                    !uint8_equals(UNSET_IPV6_ADDRESS.buffer, contact.address.address.buffer) &&
                    !uint8_equals(ipHdr.get("daddr").buffer, contact.address.address.buffer)
                ) {
                    continue
                }

                contact.recieveFrom({
                    address: ipHdr.get("saddr"),
                    addrFamily: ContactAddrFamily.IPv6,
                    port: udpHdr.get("sport"),
                    proto: ContactProto.UDP,
                }, udpHdr.get("payload"));


                return; // only 1 contact should be recieving protocol packets
            }
        }

    }

    /** 
     Master function that does all the cool stuff
     > Contact must call this func

     This function is magic
     */
    recieve(contact: Contact<ContactAddrFamily, ContactProto>, buf: Uint8Array, caddr?: ContactAddress) {
        switch (contact.addrFamily) {
            case ContactAddrFamily.RAW:
                return this.recieveRAW(contact, buf);
            case ContactAddrFamily.IPv4:
                return this.recieveIPv4(contact, buf, caddr);
            case ContactAddrFamily.IPv6:
                return this.recieveIPv6(contact, buf, caddr);
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
    private async recieveIPv4(contact: Contact<ContactAddrFamily, ContactProto>, buf: Uint8Array, caddr?: ContactAddress) {
        let saddr: IPV4Address, daddr: IPV4Address;

        // something something something check if caddr
        // if saddr unset find a suitable iface

        if (caddr) {
            if (caddr.addrFamily != ContactAddrFamily.IPv4) {
                throw "ContactAddressFamily mismatch"
            } else if (caddr.proto != contact.proto) {
                throw "ContactProto mismatch"
            }


            daddr = caddr.address;
            saddr = UNSET_IPV4_ADDRESS;
        } else {
            let ip_hdr = IPV4_HEADER.from(buf);

            daddr = ip_hdr.get("daddr");
            saddr = ip_hdr.get("saddr");
        }

        if (uint8_equals(saddr.buffer, UNSET_IPV4_ADDRESS.buffer)) {
            // have some special sauce to determine a suitable interface

            let iface = this.device.interfaces.find(({ ipv4Address, ipv4SubnetMask }) => ipv4Address && ipv4SubnetMask?.compare(ipv4Address, daddr));
            if (!iface) {
                iface = this.device.interfaces.find(i => i.ipv4Address);
            }
            if (!iface) {
                throw new Error ("no available interface to send from")
                return false; // no interface to choose from
            }

            saddr = iface.ipv4Address!
        }

        // something something something construct ipHdr
        let ipHdr: typeof IPV4_HEADER | undefined;

        if (caddr) {
            if (caddr.proto == ContactProto.UDP) {
                ipHdr = createIPV4Header({
                    saddr,
                    daddr,
                    proto: PROTOCOLS.UDP,
                    payload: createUDPHeader({
                        sport: contact.address!.port,
                        dport: caddr.port,
                        payload: buf
                    }, IPV4_PSEUDO_HEADER.create({
                        saddr,
                        daddr
                    })).getBuffer()
                })
            } else {
                throw "Whatever that's happening, is unsupported"
            }
        } else {
            ipHdr = IPV4_HEADER.from(buf);

            ipHdr.set("saddr", saddr);

            // recalculate checksum
            ipHdr.set("csum", 0);
            ipHdr.set("csum", calculateChecksum(ipHdr.getBuffer().subarray(0, 20)));
        }

        for (let iface of this.device.interfaces) {
            if (!iface.ipv4Address || iface.ipv4Address.toString() != saddr.toString()) continue;

            let dmac: MACAddress;

            if (!iface.ipv4SubnetMask?.compare(saddr, daddr)) {
                if (!iface.ipv4GW) {
                    throw new Error("Can't send no gateway")
                }

                let r = await this.device.neighborTable.getDiscover(iface.ipv4GW);
                if (typeof r == "number") {
                    // was error return
                    throw new Error(r + "")
                }

                dmac = r.macAddress;

            } else if (saddr.toString() == daddr.toString()) {
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
                payload: ipHdr.getBuffer()
            });

            this.device.log(eth_hdr, iface, "SEND")
            return iface.send(eth_hdr);

        }
    }
    private async recieveIPv6(contact: Contact<ContactAddrFamily, ContactProto>, buf: Uint8Array, caddr?: ContactAddress) {
        let saddr: IPV6Address, daddr: IPV6Address;

        if (caddr) {
            if (caddr.addrFamily != ContactAddrFamily.IPv6) {
                throw "ContactAddressFamily mismatch"
            } else if (caddr.proto != contact.proto) {
                throw "ContactProto mismatch"
            }

            daddr = caddr.address;
            saddr = UNSET_IPV6_ADDRESS;
        } else {
            let ip_hdr = IPV6_HEADER.from(buf);

            saddr = ip_hdr.get("saddr");
            daddr = ip_hdr.get("daddr");
        }

        if (uint8_equals(saddr.buffer, UNSET_IPV6_ADDRESS.buffer)) {
            // have some special sauce to determine a suitable interface

            let iface = this.device.interfaces.find(({ ipv6Address }) => ipv6Address && !ipv6Address.isLinkLocal());
            if (!iface) {
                iface = this.device.interfaces.find(i => i.ipv6Address);
            }
            if (!iface) {
                return false; // no interface to choose from
            }

            throw new Error("UNSET IPv6 not implemented")
        }

        // something something something construct ipHdr
        let ipHdr: typeof IPV6_HEADER | undefined;

        if (caddr) {
            if (caddr.proto == ContactProto.UDP) {

            }

            throw "IPV6 is not supported for proto's other than RAW"

        } else {
            ipHdr = IPV6_HEADER.from(buf);

            // set saddr 
            // and recalculate checksum
        }

        for (let iface of this.device.interfaces) {
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
                payload: ipHdr.getBuffer()
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


    /**
     * 
     * @param contact 
     * @param caddr 
     * @returns `ContactAddress` on success and false on failures
     */
    bindContact(contact: Contact<ContactAddrFamily, ContactProto>, caddr?: ContactAddress): boolean {
        // sanity check on `caddr`
        if (contact.addrFamily == ContactAddrFamily.RAW || contact.proto == ContactProto.RAW) {
            console.warn("incorrect contact type")
            return false;
        }

        // contact check that `ContactAddress` is not in use
        if (caddr) {
            if (contact.addrFamily != caddr.addrFamily) {
                console.warn("incorrect contact type: address family mismatch")
                return false;
            }

            for (let h_contact of this.contacts) {

                if (!h_contact || h_contact === contact || !h_contact.address) continue;

                if (
                    caddr.addrFamily == h_contact.address.addrFamily
                    && caddr.proto == h_contact.address.proto
                    && caddr.port == h_contact.address.port
                    && uint8_equals(caddr.address.buffer, h_contact.address.address.buffer)
                ) {
                    console.warn("ContactAddress already in use")
                    return false;
                }
            }

            contact.address = caddr;
            return true
        }

        if (this.portN >= 2 ** 16) {
            console.warn("all possible port numbers in use 😭")
            return false
        }

        caddr = {
            port: this.portN++,
            proto: contact.proto,
            //@ts-ignore
            addrFamily: contact.addrFamily,
            //@ts-ignore
            address: contact.addrFamily == ContactAddrFamily.IPv4 ?
                UNSET_IPV4_ADDRESS : UNSET_IPV6_ADDRESS
        }


        contact.address = caddr
        return true;
    }
}