import { IPV6Address } from "../../address/ipv6";
import { calculateChecksum } from "../../binary/checksum";
import { uint8_concat } from "../../binary/uint8-array";
import { ICMPV4_CODES, ICMPV4_TYPES, ICMPV6_CODES, ICMPV6_TYPES, ICMP_HEADER, ICMP_UNUSED_HEADER } from "../../header/icmp";
import { IPV4_HEADER, IPV4_PSEUDO_HEADER, IPV6_HEADER, PROTOCOLS } from "../../header/ip";
import { Program, ProcessSignal, ContactReceiveOptions, Process, address_is_unset } from "../device";
import { device_program_register } from "../internals/program";
import { PPFactory, ProgramParameterDefinition } from "../internals/program-parameters";
import { ioprintln } from "./helpers";

const RECEIVE_OPTIONS: ContactReceiveOptions = { promiscuous: true };

export const DAEMON_ROUTING: Program = device_program_register({
    name: "daemon_routing",
    init(proc) {
        // check that program is not running
        if (proc.device.processes.items.find(p => p?.id.includes(this.name) && proc != p)) {
            return ProcessSignal.EXIT;
        }
        let contact4 = proc.resources.create(proc.device.contact_create("IPv4", "RAW").data!);
        contact4.receive((contact, data) => {
            let iphdr = IPV4_HEADER.from(data.buffer);

            // use new data flags     #IDONOTLIKE_MULTICAST
            if (data.destination || data.broadcast || data.multicast || data.loopback) {
                return;
            }

            if (address_is_unset(iphdr.get("saddr"))) {
                return; // discarded
            }

            if (iphdr.get("ttl") <= 1) {
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

                return contact.send({ buffer: iphdr.getBuffer() }, iphdr.get("daddr"));
            }

            let route = proc.device.route_resolve(iphdr.get("daddr"));
            if (!route) {
                let icmphdr = ICMP_HEADER.create({
                    type: ICMPV4_TYPES.DESTINATION_UNREACHABLE,
                    code: ICMPV4_CODES[ICMPV4_TYPES.DESTINATION_UNREACHABLE].UNREACHABLE_NETWORK,
                    data: ICMP_UNUSED_HEADER.create({ data: data.buffer.slice(0, 64) }).getBuffer(),
                    csum: 0,
                });

                icmphdr.set("csum", calculateChecksum(icmphdr.getBuffer()));
                iphdr = IPV4_HEADER.create({
                    daddr: iphdr.get("saddr"),
                    proto: PROTOCOLS.ICMP,
                    payload: icmphdr.getBuffer(),
                })

                return contact.send({ buffer: iphdr.getBuffer() }, iphdr.get("daddr"))
            }

            /* do not route within the same subnet */
            if (route.netmask.compare(iphdr.get("saddr"), iphdr.get("daddr"))) {
                return; // discarded
            }

            // decrement ttl and recalculate checksum
            iphdr.set("ttl", iphdr.get("ttl") - 1);
            iphdr.set("csum", 0);
            iphdr.set("csum", calculateChecksum(iphdr.getBuffer().subarray(0, iphdr.get("ihl") << 2)));

            proc.device.event_dispatch("process_message", proc, "INFO", `ROUTING - (${iphdr.get("saddr")}) => (${iphdr.get("daddr")})`);
            contact.send({ buffer: iphdr.getBuffer() }, iphdr.get("daddr"), route)
        }, RECEIVE_OPTIONS);

        let contact6 = proc.resources.create(proc.device.contact_create("IPv6", "RAW").data!);
        contact6.receive((contact, data) => {
            let iphdr = IPV6_HEADER.from(data.buffer);

            // use new data flags     #IDONOTLIKE_MULTICAST
            if (data.broadcast || data.multicast || data.loopback) {
                return;
            }

            if (address_is_unset(iphdr.get("saddr"))) {
                return; // discarded
            }

            if (iphdr.get("hopLimit") <= 0) {
                let icmphdr = ICMP_HEADER.create({
                    type: ICMPV6_TYPES.TIME_EXCEEDED,
                    data: ICMP_UNUSED_HEADER.create({ data: data.buffer.slice(0, 64 * 4) }).getBuffer()
                });

                let route = proc.device.route_resolve(iphdr.get("saddr"));
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

                return contact.send({ buffer: iphdr.getBuffer() }, iphdr.get("daddr"), route);
            }

            let route = proc.device.route_resolve(iphdr.get("daddr"));
            if (!route) {

                let icmphdr = ICMP_HEADER.create({
                    type: ICMPV6_TYPES.DESTINATION_UNREACHABLE,
                    code: ICMPV6_CODES[ICMPV6_TYPES.DESTINATION_UNREACHABLE].NO_ROUTE,
                    data: ICMP_UNUSED_HEADER.create({ data: data.buffer.slice(0, 64 * 4) }).getBuffer()
                });

                let route = proc.device.route_resolve(iphdr.get("saddr"));
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

                return contact.send({ buffer: iphdr.getBuffer() }, iphdr.get("daddr"), route);
            }

            iphdr.set("hopLimit", iphdr.get("hopLimit") - 1)

            proc.device.event_dispatch("process_message", proc, "INFO", `ROUTING - (${iphdr.get("saddr")}) => (${iphdr.get("daddr")})`);
            contact.send({ buffer: iphdr.getBuffer() }, iphdr.get("daddr"), route)
        }, RECEIVE_OPTIONS);

        proc.handle(() => {
            contact4.close();
            contact6.close();
        });

        return ProcessSignal.__EXPLICIT__;
    },

    __NODATA__: true,
})

export const DEVICE_PROGRAM_ROUTINGMAN: Program = device_program_register({
    name: "routingman",
    description: "manage the status of the routing daemon",
    parameters: new ProgramParameterDefinition([["routingman", PPFactory.optional(PPFactory.keywords("ACTION", ["start", "stop"]))]]),
    init: function (proc: Process<any>, args: string[]): ProcessSignal {
        let [, action] = args

        if (action === "start") {
            proc.device.process_start(DAEMON_ROUTING);
        }

        let routingd = proc.device.processes.items.find(p => p?.id.includes(DAEMON_ROUTING.name) && proc != p)

        if (routingd && action == "stop") {
            routingd.close(ProcessSignal.INTERRUPT);
            routingd = undefined;
        }

        ioprintln(proc.io, "Status: " + (routingd ? "started" : "stopped"))
        return ProcessSignal.EXIT;
    },
    __NODATA__: true,
})