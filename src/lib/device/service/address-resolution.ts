import { calculateChecksum } from "../../binary/checksum";
import { ARP_HEADER, ARP_OPCODES } from "../../header/arp";
import { ETHERNET_HEADER, ETHER_TYPES } from "../../header/ethernet";
import { ICMP_HEADER, ICMP_NDP_HEADER, ICMPV6_TYPES } from "../../header/icmp";
import { IPV6_HEADER, IPV6_PSEUDO_HEADER, PROTOCOLS } from "../../header/ip";
import { Contact, ContactAddrFamily, ContactProto } from "../contact/contact";
import { Device } from "../device";
import DeviceService from "./service";
import { uint8_concat } from "../../binary/uint8-array";

export class DeviceServiceAddressResolution implements DeviceService {
    device: Device;
    private contact: Contact<ContactAddrFamily.RAW, ContactProto.RAW>
    constructor(device: Device, contact?: Contact<ContactAddrFamily.RAW, ContactProto.RAW>) {
        this.device = device;

        if (contact)
            this.contact = contact;
        else
            this.contact = this.device.contactsHandler.createContact(ContactAddrFamily.RAW, ContactProto.RAW);

        this.contact.recieve = (buf) => {
            let ethHdr = ETHERNET_HEADER.from(buf);
            if (ethHdr.get("ethertype") == ETHER_TYPES.ARP) {
                this.recieveARP(ethHdr)
            } else if (ethHdr.get("ethertype") == ETHER_TYPES.IPv6) {
                let ipHdr = IPV6_HEADER.from(ethHdr.get("payload"));
                if (ipHdr.get("nextHeader") == PROTOCOLS.IPV6_ICMP) {
                    this.reciveNDP(ethHdr, ipHdr)
                }
            }

        }
        this.contact.recieve.bind(this);
    }

    private recieveARP(ethHdr: typeof ETHERNET_HEADER) {
        let arpHdr = ARP_HEADER.from(ethHdr.get("payload"));

        if (arpHdr.get("oper") == ARP_OPCODES.REPLY) {
            // add entry to neigbor map

            let arpHdr = ARP_HEADER.from(ethHdr.get("payload"))

            let iface = this.device.interfaces.find(({ macAddress }) => macAddress.toString() == arpHdr.get("sha").toString())
            if (!iface) return;

            this.device.neighborTable.version4.set(arpHdr.get("tpa").toString(), {
                neighbor: arpHdr.get("spa"),
                iface,
                macAddress: ethHdr.get("smac"),
                createdAt: Date.now()
            })

        } else if (arpHdr.get("oper") == ARP_OPCODES.REQUEST) {
            // reply to request

            for (let iface of this.device.interfaces) {
                if (iface.ipv4Address?.toString() != arpHdr.get("tpa").toString()) {
                    continue;
                }

                let replyARPHdr = arpHdr.create({
                    oper: ARP_OPCODES.REPLY,
                    tha: iface.macAddress
                }), replyEthHdr = ETHERNET_HEADER.create({
                    dmac: arpHdr.get("sha"),
                    smac: iface.macAddress,
                    ethertype: ETHER_TYPES.ARP,
                    payload: replyARPHdr.getBuffer()
                })

                return this.contact.send(replyEthHdr.getBuffer())
            }
        }
    }
    private reciveNDP(ethHdr: typeof ETHERNET_HEADER, ipHdr: typeof IPV6_HEADER) {
        let icmpHdr = ICMP_HEADER.from(ipHdr.get("payload"));
        let ndpHdr = ICMP_NDP_HEADER.from(icmpHdr.get("data"));
        if (icmpHdr.get("type") == ICMPV6_TYPES.NEIGHBOR_ADVERTISMENT) {
            let iface = this.device.interfaces.find(({ macAddress }) => macAddress.toString() == ethHdr.get("dmac").toString())
            if (!iface) return;

            this.device.neighborTable.version6.set(ndpHdr.get("targetAddress").toString(), {
                neighbor: ipHdr.get("saddr"),
                iface,
                macAddress: ethHdr.get("smac"),
                createdAt: Date.now()
            })
        } else if (icmpHdr.get("type") == ICMPV6_TYPES.NEIGHBOR_SOLICITATION) {
            let iface = this.device.interfaces.find(({ ipv6Address }) => ipv6Address?.toString() == ndpHdr.get("targetAddress").toString())

            if (!iface) return;

            // reply to ndp Request
            let replyIcmpHdr = ICMP_HEADER.create({
                type: ICMPV6_TYPES.NEIGHBOR_ADVERTISMENT,
                data: ndpHdr.getBuffer()
            })

            // The actual spec <https://www.rfc-editor.org/rfc/rfc4443#section-2.3>
            let pseudoHdr = IPV6_PSEUDO_HEADER.create({
                saddr: iface.ipv6Address!,
                daddr: ipHdr.get("saddr"),
                len: replyIcmpHdr.size,
                proto: PROTOCOLS.IPV6_ICMP,
            })

            replyIcmpHdr.set("csum", calculateChecksum(uint8_concat([
                pseudoHdr.getBuffer(),
                replyIcmpHdr.getBuffer()
            ])));

            let replyIPHdr = IPV6_HEADER.create({
                saddr: iface.ipv6Address,
                daddr: ipHdr.get("saddr"),
                nextHeader: PROTOCOLS.IPV6_ICMP,
                payloadLength: replyIcmpHdr.size,
                payload: replyIcmpHdr.getBuffer()
            }), replyEthHdr = ETHERNET_HEADER.create({
                dmac: ethHdr.get("smac"),
                smac: iface.macAddress,
                ethertype: ETHER_TYPES.IPv6,
                payload: replyIPHdr.getBuffer()
            })

            return this.contact.send(replyEthHdr.getBuffer())
        }
    }
}