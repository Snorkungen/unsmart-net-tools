import { calculateChecksum } from "../../binary/checksum";
import { uint8_concat } from "../../binary/uint8-array";
import { ICMPV4_TYPES, ICMPV6_TYPES, ICMP_HEADER } from "../../header/icmp";
import { IPV4_HEADER, IPV6_HEADER, IPV6_PSEUDO_HEADER, PROTOCOLS } from "../../header/ip";
import { Contact, NetworkData, ProcessSignal, Program } from "../device";

// !TODO: ttl is something that i do not know what doink

function receive4(contact: Contact, data: NetworkData) {
    let iphdr = IPV4_HEADER.from(data.buffer);
    if (iphdr.get("proto") != PROTOCOLS.ICMP) {
        return;
    }

    let icmphdr = ICMP_HEADER.from(iphdr.get("payload"));

    if (icmphdr.get("type") != ICMPV4_TYPES.ECHO_REQUEST) {
        return;
    }

    // verify that destination is for source device
    if (!data.destination) return;

    let reply_icmphdr = icmphdr;
    reply_icmphdr.set("type", ICMPV4_TYPES.ECHO_REPLY);
    reply_icmphdr.set("csum", 0);
    reply_icmphdr.set("csum", calculateChecksum(reply_icmphdr.getBuffer()));

    iphdr.set("payload", reply_icmphdr.getBuffer())
    iphdr.set("ttl", 0);
    iphdr.set("csum", 0);
    let daddr = iphdr.get("saddr");
    iphdr.set("saddr", iphdr.get("daddr"))
    iphdr.set("daddr", daddr)

    iphdr.set("csum", calculateChecksum(iphdr.getBuffer().slice(0, iphdr.get("ihl") << 2)));
    let res = contact.send({ buffer: iphdr.getBuffer() }, daddr);
    if (!res.success) {
        console.log(res.error, res.message)
    }
}

function receive6(contact: Contact, data: NetworkData) {
    let iphdr = IPV6_HEADER.from(data.buffer);
    if (iphdr.get("nextHeader") != PROTOCOLS.IPV6_ICMP) {
        return;
    }

    if (!data.destination) return;

    let icmphdr = ICMP_HEADER.from(iphdr.get("payload"));
    if (icmphdr.get("type") != ICMPV6_TYPES.ECHO_REQUEST) {
        return;
    }
    let reply_icmphdr = icmphdr;
    let pseudoHdr = IPV6_PSEUDO_HEADER.create({
        saddr: iphdr.get("daddr"),
        daddr: iphdr.get("saddr"),
        len: icmphdr.size,
        proto: PROTOCOLS.IPV6_ICMP,
    })
    reply_icmphdr.set("type", ICMPV6_TYPES.ECHO_REPLY);
    reply_icmphdr.set("csum", 0);

    icmphdr.set("csum", calculateChecksum(uint8_concat([
        pseudoHdr.getBuffer(),
        icmphdr.getBuffer()
    ])));
    iphdr.set("payload", reply_icmphdr.getBuffer())
    let daddr = iphdr.get("saddr");
    iphdr.set("saddr", iphdr.get("daddr"))
    iphdr.set("daddr", daddr)

    contact.send({ buffer: iphdr.getBuffer() }, iphdr.get("daddr"));
}

export const DAEMON_ECHO_REPLIER: Program = {
    name: "daemon_echo_replier",
    init(proc) {
        // check that program is not running
        if (proc.device.processes.find(p => p?.id.includes(this.name) && proc != p)) {
            return ProcessSignal.EXIT;
        }
        let contact4 = proc.resources.create(proc.device.contact_create("IPv4", "RAW").data!);
        contact4.receive(receive4);

        let contact6 = proc.resources.create(proc.device.contact_create("IPv6", "RAW").data!);
        contact6.receive(receive6);

        proc.handle(proc, () => {
            contact4.close();
            contact6.close();
        });

        return ProcessSignal.__EXPLICIT__;
    },

    __NODATA__: true,
}