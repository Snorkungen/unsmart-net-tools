import { IPV4Address } from "../../address/ipv4";
import { IPV6Address } from "../../address/ipv6";
import { calculateChecksum } from "../../binary/checksum";
import { uint8_concat } from "../../binary/uint8-array";
import { ICMP_ECHO_HEADER, ICMP_HEADER, ICMPV4_TYPES, ICMPV6_TYPES } from "../../header/icmp";
import { createIPV4Header, PROTOCOLS, IPV6_PSEUDO_HEADER, IPV6_HEADER } from "../../header/ip";
import { ContactAddrFamily, ContactProto } from "../contact/contact";
import { UNSET_IPV4_ADDRESS } from "../contact/contacts-handler";
import { Device } from "../device";

function ping (device: Device, ip: string) {
    function success() {
        console.log("%c ECHO Reply recieved: " + device.name, ['background: green', 'color: white', 'display: block', 'text-align: center', 'font-size: 24px'].join(';'))
    }
    let identifier = Math.floor(Math.random() * 1_000), sequence = 1;

    let echoHdr = ICMP_ECHO_HEADER.create({
        id: identifier,
        seq: sequence
    })

    if (IPV4Address.validate(ip)) {
        let contact = device.contactsHandler.createContact(ContactAddrFamily.IPv4, ContactProto.RAW);
        contact.recieve = () => {
            contact.close();
            success()
        };

        let icmpHdr = ICMP_HEADER.create({
            type: ICMPV4_TYPES.ECHO_REQUEST,
            data: echoHdr.getBuffer()
        });

        icmpHdr.set("csum", calculateChecksum(icmpHdr.getBuffer()));

        let ipHdr = createIPV4Header({
            saddr: UNSET_IPV4_ADDRESS,
            daddr: new IPV4Address(ip),
            proto: PROTOCOLS.ICMP,
            payload: icmpHdr.getBuffer()
        })

        contact.send(ipHdr.getBuffer());

    } else if (/* IPV6Address.validate(ip) */ true) {
        let contact = device.contactsHandler.createContact(ContactAddrFamily.IPv6, ContactProto.RAW);
        contact.recieve = () => {
            contact.close();
            success()
        };

        let icmpHdr = ICMP_HEADER.create({
            type: ICMPV6_TYPES.ECHO_REQUEST,
            data: echoHdr.getBuffer()
        });

        let pseudoHdr = IPV6_PSEUDO_HEADER.create({
            saddr: device.interfaces[0].ipv6Address!,
            daddr: new IPV6Address(ip),
            len: icmpHdr.size,
            proto: PROTOCOLS.IPV6_ICMP,
        })

        icmpHdr.set("csum", calculateChecksum(uint8_concat([pseudoHdr.getBuffer(), icmpHdr.getBuffer()])));

        let ipHdr = IPV6_HEADER.create({
            saddr: device.interfaces[0].ipv6Address!,
            daddr: new IPV6Address(ip),
            nextHeader: PROTOCOLS.IPV6_ICMP,
            payload: icmpHdr.getBuffer()
        })

        contact.send(ipHdr.getBuffer());
    }

}