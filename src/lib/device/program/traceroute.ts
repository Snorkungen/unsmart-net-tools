import { IPV4Address } from "../../address/ipv4";
import { IPV6Address } from "../../address/ipv6";
import { calculateChecksum } from "../../binary/checksum";
import { uint8_concat, uint8_equals } from "../../binary/uint8-array";
import { ICMP_HEADER, ICMPV4_CODES, ICMPV4_TYPES, ICMPV6_CODES, ICMPV6_TYPES } from "../../header/icmp";
import { IPV4_HEADER, IPV4_PSEUDO_HEADER, IPV6_HEADER, IPV6_PSEUDO_HEADER, PROTOCOLS } from "../../header/ip";
import { UDP_HEADER } from "../../header/udp";
import { Contact, DeviceResult, DeviceRoute, NetworkData, ProcessSignal, Program } from "../device";
import { PPFactory, ProgramParameterDefinition } from "../internals/program-parameters";
import { ioprint, ioprintln } from "./helpers";
import { headless_ping_resolve_destination } from "./ping";

type TracerouteData<A = (IPV4Address | IPV6Address)> = {
    contact: Contact,
    hops: number,
    rtentry: DeviceRoute,
    udphdr: typeof UDP_HEADER,

    daddr: A,
    saddr: A,

    log(this: TracerouteData, saddr: A): void
}

function send4(data: TracerouteData) {
    let iphdr = IPV4_HEADER.create({
        daddr: data.daddr,
        saddr: data.saddr,
        ttl: ++data.hops,
        proto: PROTOCOLS.UDP,
        payload: data.udphdr.getBuffer(),
    });

    return data.contact.send({ buffer: iphdr.getBuffer() }, data.daddr, data.rtentry)
}
function send6(data: TracerouteData) {
    let iphdr = IPV6_HEADER.create({
        daddr: data.daddr as IPV6Address,
        saddr: data.saddr as IPV6Address,
        hopLimit: ++data.hops,
        nextHeader: PROTOCOLS.UDP,
        payload: data.udphdr.getBuffer(),
    });

    return data.contact.send({ buffer: iphdr.getBuffer() }, data.daddr, data.rtentry)
}

function receive4(this: TracerouteData<IPV4Address>, _: unknown, data: NetworkData) {
    let iphdr = IPV4_HEADER.from(data.buffer);

    if (calculateChecksum(iphdr.getBuffer().slice(0, iphdr.get("ihl") << 2)) != 0) {
        return; // bad checksum
    }

    if (!uint8_equals(iphdr.get("daddr").buffer, this.saddr.buffer)) {
        return; // ignore not for current destination
    }

    if (iphdr.get("proto") != PROTOCOLS.ICMP) {
        return; // not interested
    }

    let icmphdr = ICMP_HEADER.from(iphdr.get("payload"));
    if (calculateChecksum(icmphdr.getBuffer()) !== 0) {
        return; // bad checksum
    }

    if (icmphdr.get("type") != ICMPV4_TYPES.DESTINATION_UNREACHABLE && icmphdr.get("type") != ICMPV4_TYPES.TIME_EXCEEDED) {
        return; // not interested
    }

    let err_iphdr = IPV4_HEADER.from(icmphdr.get("data").subarray(4) /* skip over unused field */)

    if (err_iphdr.get("proto") != PROTOCOLS.UDP) {
        return; // not interested
    }

    if (!uint8_equals(err_iphdr.get("daddr").buffer, this.daddr.buffer) || !uint8_equals(err_iphdr.get("saddr").buffer, this.saddr.buffer)) {
        return; // not interested
    }

    let udphdr = UDP_HEADER.from(err_iphdr.get("payload"));

    if (udphdr.get("dport") != this.udphdr.get("dport") || udphdr.get("sport") != this.udphdr.get("sport")) {
        return; // not interested
    }

    // check the error type 
    if (icmphdr.get("type") == ICMPV4_TYPES.TIME_EXCEEDED && icmphdr.get("code") == ICMPV4_CODES[ICMPV4_TYPES.TIME_EXCEEDED].TTL) {
        this.log(iphdr.get("saddr"))
        return send4(this);
    }

    // reached final destination
    this.log(iphdr.get("saddr"));
}

function receive6(this: TracerouteData<IPV6Address>, _: unknown, data: NetworkData) {
    let iphdr = IPV6_HEADER.from(data.buffer);

    if (!uint8_equals(iphdr.get("daddr").buffer, this.saddr.buffer)) {
        return; // ignore not for current destination
    }

    if (iphdr.get("nextHeader") != PROTOCOLS.IPV6_ICMP) {
        return; // not interested
    }

    let icmphdr = ICMP_HEADER.from(iphdr.get("payload"));

    let pseudohdr = IPV6_PSEUDO_HEADER.create({
        saddr: iphdr.get("saddr"), daddr: iphdr.get("daddr"), len: icmphdr.size, proto: PROTOCOLS.IPV6_ICMP,
    });

    if (calculateChecksum(uint8_concat([pseudohdr.getBuffer(), icmphdr.getBuffer()])) !== 0) {
        return; // bad checksum
    }

    if (icmphdr.get("type") != ICMPV6_TYPES.DESTINATION_UNREACHABLE && icmphdr.get("type") != ICMPV6_TYPES.TIME_EXCEEDED) {
        return; // not interested
    }

    let err_iphdr = IPV6_HEADER.from(icmphdr.get("data").subarray(4) /* skip over unused field */);

    if (err_iphdr.get("nextHeader") != PROTOCOLS.UDP) {
        return; // not interested
    }

    if (!uint8_equals(err_iphdr.get("daddr").buffer, this.daddr.buffer) || !uint8_equals(err_iphdr.get("saddr").buffer, this.saddr.buffer)) {
        return; // not interested
    }

    let udphdr = UDP_HEADER.from(err_iphdr.get("payload"));

    if (udphdr.get("dport") != this.udphdr.get("dport") || udphdr.get("sport") != this.udphdr.get("sport")) {
        return; // not interested
    }

    // check the error type 
    if (icmphdr.get("type") == ICMPV6_TYPES.TIME_EXCEEDED && icmphdr.get("code") == ICMPV6_CODES[ICMPV6_TYPES.TIME_EXCEEDED]) {
        this.log(iphdr.get("saddr"))
        return send4(this);
    }

    // reached final destination
    this.log(iphdr.get("saddr"));
}


const pdef = new ProgramParameterDefinition([
    ["traceroute", PPFactory.value("DESTINATION")]
])


export const DEVICE_PROGRAM_TRACEROUTE: Program<TracerouteData> = {
    name: "traceroute",
    description: "Tries to detect in the route to the destination",
    parameters: pdef,
    async init(proc, args, data) {
        let [, target] = args;

        if (!target) {
            ioprint(proc.io, "destination mising");
            return ProcessSignal.ERROR;
        }

        let contact: Contact;
        let destination = await headless_ping_resolve_destination(proc, target);
        if (destination instanceof IPV4Address) {
            contact = proc.resources.create(
                proc.device.contact_create("IPv4", "RAW").data!
            );
        } else if (destination instanceof IPV6Address) {
            contact = proc.resources.create(
                proc.device.contact_create("IPv6", "RAW").data!
            );
        } else {
            ioprint(proc.io, "Failed to parse given destination: " + target);
            return ProcessSignal.ERROR;
        }

        let rtentry = proc.device.route_resolve(destination);
        if (!rtentry) {
            ioprint(proc.io, "Destination unreachable");
            contact.close();
            return ProcessSignal.ERROR;
        }

        let source = rtentry.iface.addresses.find(value => value.address.constructor == destination.constructor);
        if (!source) {
            return ProcessSignal.ERROR;
        }


        // Do the actual stuff for targeting a destination ...

        let send: (data: TracerouteData) => DeviceResult<unknown, unknown>;
        let receive: (_: unknown, data: NetworkData) => void;
        let udppayload = new Uint8Array(40);
        let port = 0x7ffe - (Math.floor(Math.random() * 2_000));

        // construct a UDP Datagram
        let udphdr = UDP_HEADER.create({
            sport: port,
            dport: port,
            payload: udppayload,
        });
        udphdr.set("length", udphdr.size);

        // compute the checksum ...
        if (destination instanceof IPV4Address) {
            let pseudohdr = IPV4_PSEUDO_HEADER.create({
                saddr: source.address,
                daddr: destination,
                proto: PROTOCOLS.UDP,
                len: udphdr.size
            })

            udphdr.set("csum", calculateChecksum(uint8_concat([
                pseudohdr.getBuffer(),
                udphdr.getBuffer()])) || 0xffff);

            send = send4;
            receive = receive4;
        } else if (destination instanceof IPV6Address && source.address instanceof IPV6Address) {
            let pseudohdr = IPV6_PSEUDO_HEADER.create({
                saddr: source.address,
                daddr: destination,
                proto: PROTOCOLS.UDP,
                len: udphdr.size
            });

            udphdr.set("csum", calculateChecksum(uint8_concat([
                pseudohdr.getBuffer(),
                udphdr.getBuffer()])));

            send = send6;
            receive = receive6;
        } else {
            return ProcessSignal.ERROR;
        }

        ioprint(proc.io, "Tracing route to destination: " + destination.toString() + "\n\n");

        proc.data = <TracerouteData>{
            contact: contact,
            hops: 0,
            rtentry: rtentry,
            udphdr: udphdr,

            daddr: destination,
            saddr: source.address,

            log(saddr) {
                ioprintln(proc.io, `received from: ${saddr}, hop: ${this.hops}`);
                if (uint8_equals(saddr.buffer, this.daddr.buffer)) {
                    ioprint(proc.io, `\nReached destination with ${this.hops} hops`)
                    proc.close();
                }
            },
        }

        send(proc.data)
        contact.receive(receive.bind(proc.data))

        return ProcessSignal.__EXPLICIT__;
    }
}