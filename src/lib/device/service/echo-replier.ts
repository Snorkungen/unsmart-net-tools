import { ICMPV4_TYPES, ICMPV6_TYPES, ICMP_HEADER } from "../../header/icmp";
import { IPV4_HEADER, IPV6_HEADER, IPV6_PSEUDO_HEADER, PROTOCOLS, createIPV4Header } from "../../header/ip";
import { ContactAddrFamily, ContactProto } from "../contact/contact";
import { Device } from "../device";
import DeviceService from "./service";
import { calculateChecksum } from "../../binary/checksum";
import { uint8_concat } from "../../binary/uint8-array";

export class DeviceServiceEchoReplier implements DeviceService {
    device: Device;

    constructor(device: Device) {
        this.device = device;

        let v4Contact = this.device.contactsHandler.createContact(ContactAddrFamily.IPv4, ContactProto.RAW);
        v4Contact.recieve = (buf) => {
            let ipHdr = IPV4_HEADER.from(buf);
            if (ipHdr.get("proto") != PROTOCOLS.ICMP) return;
            let icmpHdr = ICMP_HEADER.from(ipHdr.get("payload"));
            if (icmpHdr.get("type") != ICMPV4_TYPES.ECHO_REQUEST) return;

            let replyIcmpHdr = ICMP_HEADER.create({
                type: ICMPV4_TYPES.ECHO_REPLY,
                data: uint8_concat([icmpHdr.get("data"), ipHdr.getBuffer().subarray(0, 28)])
            });

            // I have no clue if this is the right way to calculate the checksum
            replyIcmpHdr.set("csum", calculateChecksum(replyIcmpHdr.getBuffer()));

            let replyIPHdr = createIPV4Header({
                saddr: ipHdr.get("daddr"),
                daddr: ipHdr.get("saddr"),
                proto: PROTOCOLS.ICMP,
                payload: replyIcmpHdr.getBuffer()
            });

            v4Contact.send(replyIPHdr.getBuffer())
        }

        let v6Contact = this.device.contactsHandler.createContact(ContactAddrFamily.IPv6, ContactProto.RAW);
        v6Contact.recieve = (buf) => {
            let ipHdr = IPV6_HEADER.from(buf);
            if (ipHdr.get("nextHeader") != PROTOCOLS.IPV6_ICMP) return;
            let icmpHdr = ICMP_HEADER.from(ipHdr.get("payload"));
            if (icmpHdr.get("type") != ICMPV6_TYPES.ECHO_REQUEST) return;

            let replyIcmpHdr = ICMP_HEADER.create({
                type: ICMPV6_TYPES.ECHO_REPLY,
                data: uint8_concat([icmpHdr.get("data"), ipHdr.getBuffer()])
            })

            // The actual spec <https://www.rfc-editor.org/rfc/rfc4443#section-2.3>
            let pseudoHdr = IPV6_PSEUDO_HEADER.create({
                saddr: ipHdr.get("daddr"),
                daddr: ipHdr.get("saddr"),
                len: replyIcmpHdr.size,
                nextHeader: PROTOCOLS.IPV6_ICMP,
            })

            replyIcmpHdr.set("csum", calculateChecksum(uint8_concat([
                pseudoHdr.getBuffer(),
                replyIcmpHdr.getBuffer()
            ])));


            let replyIPHdr = IPV6_HEADER.create({
                saddr: ipHdr.get("daddr"),
                daddr: ipHdr.get("saddr"),
                nextHeader: PROTOCOLS.IPV6_ICMP,
                payloadLength: replyIcmpHdr.size,
                payload: replyIcmpHdr.getBuffer()
            })
            v6Contact.send(replyIPHdr.getBuffer());
        }
    }
} 