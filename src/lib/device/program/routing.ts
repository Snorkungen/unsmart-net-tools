import { IPV4Address } from "../../address/ipv4";
import { not, or } from "../../binary";
import { calculateChecksum } from "../../binary/checksum";
import { uint8_equals } from "../../binary/uint8-array";
import { ICMPV4_CODES, ICMPV4_TYPES, ICMPV6_CODES, ICMPV6_TYPES, ICMP_HEADER } from "../../header/icmp";
import { IPV4_HEADER, IPV6_HEADER, PROTOCOLS } from "../../header/ip";
import { Program, ProcessSignal } from "../device2";

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
                    type: ICMPV4_TYPES.TIMESTAMP,
                    code: ICMPV4_CODES[ICMPV4_TYPES.TIME_EXCEEDED].TTL,
                    data: iphdr.getBuffer().subarray(0, 64)
                });

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

            
            // decrement ttl and recalculate checksum
            iphdr.set("ttl", iphdr.get("ttl") - 1);
            iphdr.set("csum", 0);
            iphdr.set("csum", calculateChecksum(iphdr.getBuffer().subarray(0, iphdr.get("ihl") << 2)));
            
            console.log(proc.device.name, "[ROUTING]")
            contact.send(contact, { buffer: iphdr.getBuffer() }, iphdr.get("daddr"), route)
        });

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
                    data: iphdr.getBuffer().subarray(0, 64)
                });

                iphdr = IPV6_HEADER.create({
                    daddr: iphdr.get("daddr"),
                    nextHeader: PROTOCOLS.IPV6_ICMP,
                    payload: icmphdr.getBuffer(),
                });

                return contact.send(contact, { buffer: iphdr.getBuffer() }, iphdr.get("daddr"));
            }

            let route = proc.device.route_resolve(iphdr.get("daddr"));
            if (!route) {
                return; // discarded
            }

            iphdr.set("hopLimit", iphdr.get("hopLimit") - 1)
        });

        proc.handle(proc, () => {
            contact4.close(contact4);
            contact6.close(contact6);
        });

        return ProcessSignal.__EXPLICIT__;
    },

    __NODATA__: true,
}