import { BaseAddress } from "../../address/base";
import { IPV4Address } from "../../address/ipv4";
import { IPV6Address } from "../../address/ipv6";
import { calculateChecksum } from "../../binary/checksum";
import { uint8_concat, uint8_equals, uint8_fromString } from "../../binary/uint8-array";
import { ICMP_ECHO_HEADER, ICMP_HEADER, ICMP_UNUSED_HEADER, ICMPV4_TYPES, ICMPV6_TYPES } from "../../header/icmp";
import { IPV4_HEADER, IPV6_HEADER, IPV6_PSEUDO_HEADER, PROTOCOLS } from "../../header/ip";
import { Contact, DeviceRoute, NetworkData, Process, ProcessSignal, Program } from "../device";

const MSG_DST_UNREACH = uint8_fromString(
    "Destination unreachable"
)

type PingData = {
    contact: Contact;
    identifier: number;
    sequence: number;
    destination: BaseAddress;
    maxSendCount: number;
    route: DeviceRoute;
    send: (proc: Process<PingData>) => void;
    timestamps: Map<number, number>;
    stats: Map<number, number>;
}

function handleExternalExit(proc: Process<PingData>) {
    proc.data.contact.close(proc.data.contact);

    let count = 0;
    let sum = 0;
    for (let [, time] of proc.data.stats) {
        sum += time;
        count += 1;
    }
    if (count == 0) return;
    let avg = (sum / count);

    proc.term_write(uint8_fromString(
        `\n${count} replies received, with an average time of ${avg.toFixed(1)} ms`
    ))
}

function canSend(proc: Process<PingData>): boolean {
    if (proc.data.sequence < proc.data.maxSendCount) {
        return true;
    }
    proc.close(proc, ProcessSignal.INTERRUPT);
    return false;
}

function sendv4(proc: Process<PingData>) {
    if (!canSend(proc)) { return; }

    let echohdr = ICMP_ECHO_HEADER.create({
        id: proc.data.identifier,
        seq: proc.data.sequence,
    }), icmphdr = ICMP_HEADER.create({
        type: ICMPV4_TYPES.ECHO_REQUEST,
        data: echohdr.getBuffer()
    });

    icmphdr.set("csum", calculateChecksum(icmphdr.getBuffer()));

    let iphdr = IPV4_HEADER.create({
        proto: PROTOCOLS.ICMP,
        payload: icmphdr.getBuffer()
    });

    proc.data.timestamps.set(proc.data.sequence, Date.now());
    proc.data.contact.send(proc.data.contact, { buffer: iphdr.getBuffer() }, proc.data.destination, proc.data.route)
}

function sendv6(proc: Process<PingData>) {
    if (!canSend(proc)) { return; }
    let echohdr = ICMP_ECHO_HEADER.create({
        id: proc.data.identifier,
        seq: proc.data.sequence,
    }), icmphdr = ICMP_HEADER.create({
        type: ICMPV6_TYPES.ECHO_REQUEST,
        data: echohdr.getBuffer(),
        csum: 0,
    });

    let source = proc.data.route.iface.addresses.find((v) => v.address.constructor == proc.data.destination.constructor);
    if (!source) return;

    let pseudoHdr = IPV6_PSEUDO_HEADER.create({
        saddr: source.address as IPV6Address,
        daddr: proc.data.destination as IPV6Address,
        len: icmphdr.size,
        proto: PROTOCOLS.IPV6_ICMP,
    })

    icmphdr.set("csum", calculateChecksum(uint8_concat([
        pseudoHdr.getBuffer(),
        icmphdr.getBuffer()
    ])));

    let iphdr = IPV6_HEADER.create({ nextHeader: PROTOCOLS.IPV6_ICMP, payload: icmphdr.getBuffer() })
    proc.data.timestamps.set(proc.data.sequence, Date.now());
    proc.data.contact.send(proc.data.contact, { buffer: iphdr.getBuffer() }, proc.data.destination, proc.data.route)
}

function handlereply(proc: Process<PingData>, source: BaseAddress, bytes: number, ttl: number, seq: number) {
    let sendTime = proc.data.timestamps.get(seq);
    if (!sendTime) {
        // the sequence number has not been sent.
        return;
    }

    let time = Date.now() - sendTime;

    proc.term_write(uint8_fromString(
        `${bytes} bytes from ${source}: seq=${seq} ttl=${ttl} time=${time} ms\n`
    ));

    if (seq != proc.data.sequence) {
        return; // wait for the correct sequence number to be replied
    }

    proc.data.stats.set(proc.data.sequence, time);

    proc.data.sequence += 1;
    proc.data.send(proc);
}

function receivev4(proc: Process<PingData>) { // !TODO: rewrite everything againg because this does not feel so ergonomic
    return function (_: Contact, data: NetworkData) {
        let iphdr = IPV4_HEADER.from(data.buffer);
        if (iphdr.get("proto") != PROTOCOLS.ICMP) {
            return;
        }

        let icmphdr = ICMP_HEADER.from(iphdr.get("payload"));

        // validate checksum
        if (calculateChecksum(icmphdr.getBuffer()) != 0) {
            return; // invalid checksum
        }

        if (icmphdr.get("type") == ICMPV4_TYPES.DESTINATION_UNREACHABLE) {
            if (icmphdr.get("data").length < (ICMP_UNUSED_HEADER.size + IPV4_HEADER.size + ICMP_HEADER.size + ICMP_ECHO_HEADER.size)) {
                return;
            }

            // match payload with an outgoing request
            let err_iphdr = IPV4_HEADER.from(ICMP_UNUSED_HEADER.from(icmphdr.get("data")).get("data"));

            // compare daddr and saddr
            if (!uint8_equals(proc.data.destination.buffer, err_iphdr.get("daddr").buffer)) {
                return;
            } else if (!(
                proc.data.route.iface.addresses.find(v => uint8_equals(v.address.buffer, err_iphdr.get("saddr").buffer))
            )) {
                return; // ping not sent from saved route
            }

            if (err_iphdr.get("proto") != PROTOCOLS.ICMP) {
                return;
            }

            let err_icmphdr = ICMP_HEADER.from(err_iphdr.get("payload"));
            if (err_icmphdr.get("type") != ICMPV4_TYPES.ECHO_REQUEST) {
                return;
            }

            let err_echohdr = ICMP_ECHO_HEADER.from(err_icmphdr.get("data"));
            if (err_echohdr.get("id") != proc.data.identifier) {
                return;
            }

            { // fail program
                proc.data.contact.close(proc.data.contact);
                proc.term_write(MSG_DST_UNREACH)
                proc.close(proc, ProcessSignal.ERROR);
            }
        }


        if (!(uint8_equals(iphdr.get("saddr").buffer, proc.data.destination.buffer))) {
            return; // HMM
        }

        if (icmphdr.get("type") != ICMPV4_TYPES.ECHO_REPLY) {
            return;
        }

        let echohdr = ICMP_ECHO_HEADER.from(icmphdr.get("data"));
        if (echohdr.get("id") != proc.data.identifier) {
            return;
        }

        handlereply(proc, iphdr.get("saddr"), iphdr.get("payload").byteLength, iphdr.get("ttl"), echohdr.get("seq"));
    }
}

function receivev6(proc: Process<PingData>) {
    return function (_: Contact, data: NetworkData) {
        let iphdr = IPV6_HEADER.from(data.buffer);
        if (iphdr.get("nextHeader") != PROTOCOLS.IPV6_ICMP) {
            return;
        }

        let icmphdr = ICMP_HEADER.from(iphdr.get("payload"));

        // validate checksum
        let pseudohdr = IPV6_PSEUDO_HEADER.create({
            saddr: iphdr.get("saddr"), daddr: iphdr.get("daddr"), len: icmphdr.size, proto: PROTOCOLS.IPV6_ICMP,
        });
        if (calculateChecksum(uint8_concat([pseudohdr.getBuffer(), icmphdr.getBuffer()])) !== 0) {
            return;
        }

        if ((icmphdr.get("type") & 0x80) == 0) { // message is an error
            if (icmphdr.get("data").length < (ICMP_UNUSED_HEADER.size + IPV6_HEADER.size + ICMP_HEADER.size + ICMP_ECHO_HEADER.size)) {
                return;
            }

            // match payload with an outgoing request
            let err_iphdr = IPV6_HEADER.from(ICMP_UNUSED_HEADER.from(icmphdr.get("data")).get("data"));

            // compare daddr and saddr
            if (!uint8_equals(proc.data.destination.buffer, err_iphdr.get("daddr").buffer)) {
                return;
            } else if (!(
                proc.data.route.iface.addresses.find(v => uint8_equals(v.address.buffer, err_iphdr.get("saddr").buffer))
            )) {
                return; // ping not sent from saved route
            }

            if (err_iphdr.get("nextHeader") != PROTOCOLS.IPV6_ICMP) {
                return;
            }

            let err_icmphdr = ICMP_HEADER.from(iphdr.get("payload"));
            if (err_icmphdr.get("type") != ICMPV6_TYPES.ECHO_REQUEST) {
                return;
            }

            if (err_icmphdr.get("type") == ICMPV6_TYPES.DESTINATION_UNREACHABLE) {
                let err_echohdr = ICMP_ECHO_HEADER.from(err_icmphdr.get("data"));
                if (err_echohdr.get("id") != proc.data.identifier) {
                    return;
                }

                { // fail program
                    proc.data.contact.close(proc.data.contact);
                    proc.term_write(MSG_DST_UNREACH)
                    proc.close(proc, ProcessSignal.ERROR);
                }
            }
        }

        if (!(uint8_equals(iphdr.get("saddr").buffer, proc.data.destination.buffer))) {
            return; // HMM
        }

        if (icmphdr.get("type") != ICMPV6_TYPES.ECHO_REPLY) {
            return;
        }

        let echohdr = ICMP_ECHO_HEADER.from(icmphdr.get("data"));
        if (echohdr.get("id") != proc.data.identifier) {
            return;
        }

        handlereply(proc, iphdr.get("saddr"), iphdr.get("payload").length, iphdr.get("hopLimit"), echohdr.get("seq"));
    }
}

const DEFAULT_MAX_SENDCOUNT = 10;
export const DEVICE_PROGRAM_PING: Program = {
    name: "ping",
    description: "Sends icmp echo requests to target",
    content: `<ping [destination] ?[sendCount]>
<ping 192.168.1.1>
<ping ::1 4>`,
    init(proc, argv) {
        let [, target, sendCount] = argv
        let destination: IPV4Address | IPV6Address;
        let contact: Contact | undefined;
        let identifier = Math.floor(Math.random() * (0xffff));

        let maxSendCount = parseInt(sendCount);
        if (isNaN(maxSendCount)) {
            maxSendCount = DEFAULT_MAX_SENDCOUNT;
        }

        let sender: (proc: Process<PingData>) => void;
        let receiver: (contact: Contact, data: NetworkData) => void;

        if (IPV4Address.validate(target)) {
            contact = proc.device.contact_create("IPv4", "RAW").data!;
            destination = new IPV4Address(target);
            sender = sendv4;
            receiver = receivev4(proc)
        } else if (IPV6Address.validate(target)) {
            contact = proc.device.contact_create("IPv6", "RAW").data!;
            destination = new IPV6Address(target);
            sender = sendv6;
            receiver = receivev6(proc)
        } else {
            // maybe in future dns resolution
            proc.term_write(uint8_fromString(
                "Failed to parse given address: " + target
            ));

            return ProcessSignal.EXIT;
        }

        let route = proc.device.route_resolve(destination);
        if (!route) {
            proc.term_write(MSG_DST_UNREACH);
            return ProcessSignal.EXIT;
        }

        (<Process<PingData>>proc).data = {
            contact: contact,
            identifier: identifier,
            sequence: 0,
            destination: destination,
            route: route,
            maxSendCount: maxSendCount,
            timestamps: new Map(),
            stats: new Map(),

            send: sender,
        }

        // register methods
        proc.handle(proc, handleExternalExit);
        contact.receive(contact, receiver);

        (<Process<PingData>>proc).data.send(proc); // send first ping

        return ProcessSignal.__EXPLICIT__;
    }
}