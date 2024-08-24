import { IPV6Address } from "../../address/ipv6";
import { calculateChecksum } from "../../binary/checksum";
import { uint8_concat, uint8_equals } from "../../binary/uint8-array";
import { ICMPV4_CODES, ICMPV4_TYPES, ICMPV6_CODES, ICMPV6_TYPES, ICMP_HEADER, ICMP_UNUSED_HEADER } from "../../header/icmp";
import { IPV4_HEADER, IPV4_PSEUDO_HEADER, IPV6_HEADER, PROTOCOLS } from "../../header/ip";
import { Program, ProcessSignal, ContactReceiveOptions } from "../device";

const RECEIVE_OPTIONS: ContactReceiveOptions = { promiscuous: true };

export const DAEMON_ROUTING: Program = {
    name: "daemon_routing",
    init(proc) {
        // check that program is not running
        if (proc.device.processes.find(p => p?.id.includes(this.name) && proc != p)) {
            return ProcessSignal.EXIT;
        }
        let contact4 = proc.device.contact_create("IPv4", "RAW").data!;
        contact4.receive(contact4, (contact, data) => {
            let iphdr = IPV4_HEADER.from(data.buffer);

            // use new data flags     #IDONOTLIKE_MULTICAST
            if (data.destination || data.broadcast || data.multicast || data.loopback) {
                return;
            }

            if (iphdr.get("ttl") < 1) {
                let icmphdr = ICMP_HEADER.create({
                    type: ICMPV4_TYPES.TIME_EXCEEDED,
                    code: ICMPV4_CODES[ICMPV4_TYPES.TIME_EXCEEDED].TTL,
                    data: ICMP_UNUSED_HEADER.create({ data: data.buffer.slice(0, 64) }).getBuffer(),
                    csum: 0
                });

                icmphdr.set("csum", calculateChecksum(icmphdr.getBuffer()))
                iphdr = IPV4_HEADER.create({
                    daddr: iphdr.get("saddr"),
                    proto: PROTOCOLS.ICMP,
                    payload: icmphdr.getBuffer()
                });

                return contact.send(contact, { buffer: iphdr.getBuffer() }, iphdr.get("daddr"));
            }

            let route = proc.device.route_resolve(iphdr.get("daddr"));
            if (!route) {
                return; // discarded
            }
            
            /* do not route within the same subnet */
            if (route.netmask.compare(iphdr.get("saddr"), iphdr.get("daddr"))) {
                return; // discarded
            }

            // decrement ttl and recalculate checksum
            iphdr.set("ttl", iphdr.get("ttl") - 1);
            iphdr.set("csum", 0);
            iphdr.set("csum", calculateChecksum(iphdr.getBuffer().subarray(0, iphdr.get("ihl") << 2)));

            console.log(proc.device.name, "[ROUTING]")
            contact.send(contact, { buffer: iphdr.getBuffer() }, iphdr.get("daddr"), route)
        }, RECEIVE_OPTIONS);

        let contact6 = proc.device.contact_create("IPv6", "RAW").data!;
        contact6.receive(contact6, (contact, data) => {
            let iphdr = IPV6_HEADER.from(data.buffer);

            // use new data flags     #IDONOTLIKE_MULTICAST
            if (data.broadcast || data.multicast || data.loopback) {
                return;
            }

            if (iphdr.get("hopLimit") <= 0) {
                let icmphdr = ICMP_HEADER.create({
                    type: ICMPV6_TYPES.TIME_EXCEEDED,
                    data: ICMP_UNUSED_HEADER.create({ data: data.buffer.slice(0, 64) }).getBuffer()
                });

                let route = proc.device.route_resolve(iphdr.get("daddr"));
                if (!route) return;
                let source = route.iface.addresses.find(a => a.address instanceof IPV6Address)
                if (!source) return;

                let pseudohdr = IPV4_PSEUDO_HEADER.create({
                    saddr: source.address,
                    daddr: iphdr.get("saddr"),
                    proto: PROTOCOLS.IPV6_ICMP,
                    len: icmphdr.size
                });

                icmphdr.set("csum", calculateChecksum(uint8_concat([pseudohdr.getBuffer(), icmphdr.getBuffer()])))

                iphdr = IPV6_HEADER.create({
                    daddr: iphdr.get("saddr"),
                    nextHeader: PROTOCOLS.IPV6_ICMP,
                    payload: icmphdr.getBuffer(),
                });

                return contact.send(contact, { buffer: iphdr.getBuffer() }, iphdr.get("saddr"));
            }

            let route = proc.device.route_resolve(iphdr.get("daddr"));
            if (!route) {
                return; // discarded
            }

            iphdr.set("hopLimit", iphdr.get("hopLimit") - 1)
        }, RECEIVE_OPTIONS);

        proc.handle(proc, () => {
            contact4.close(contact4);
            contact6.close(contact6);
        });

        return ProcessSignal.__EXPLICIT__;
    },

    __NODATA__: true,
}