import { Component, createEffect } from "solid-js";
import Terminal, { TerminalRenderer } from "../lib/terminal/terminal";
import { uint8_concat, uint8_fromNumber, uint8_fromString, uint8_mutateSet, uint8_readUint32BE } from "../lib/binary/uint8-array";
import { Device } from "../lib/device/device";
import Shell from "../lib/terminal/shell";
import { ASCIICodes, CSI } from "../lib/terminal/shared";
import { DEVICE_PROGRAM_CLEAR, DEVICE_PROGRAM_ECHO, DEVICE_PROGRAM_HELP } from "../lib/device/program/program";
import { DPSignal, DeviceProgramStatus } from "../lib/device/device-program";
import { formatTable } from "../lib/device/program/helpers";
import { Device2, EthernetInterface, LoopbackInterface, ProcessSignal, Program } from "../lib/device/device2";
import { ICMPV4_TYPES, ICMPV6_TYPES, ICMP_HEADER, ICMP_ECHO_HEADER } from "../lib/header/icmp";
import { IPV4Address } from "../lib/address/ipv4";
import { calculateChecksum } from "../lib/binary/checksum";
import { createIPV4Header, IPV4_HEADER, IPV6_HEADER, IPV6_PSEUDO_HEADER, PROTOCOLS } from "../lib/header/ip";
import { MACAddress } from "../lib/address/mac";
import { createMask } from "../lib/address/mask";
import { PCAP_GLOBAL_HEADER, PCAP_MAGIC_NUMBER, PCAP_RECORD_HEADER } from "../lib/header/pcap";
import { IPV6Address } from "../lib/address/ipv6";
import { DAEMON_SHELL } from "../lib/device/program/shell2";

function downloadDevice2PCAP(device: Device2) {
    let records = device.log_select_records();
    let buffer = [PCAP_GLOBAL_HEADER.create({
        "magicNumber": PCAP_MAGIC_NUMBER,
        "versionMajor": 2,
        "versionMinor": 4,
        "thiszone": 2,
        "sigfigs": 0,
        "snaplen": 2 ** 32 - 2,
        "network": 1
    }).getBuffer()]

    for (let record of records) {
        buffer.push(
            PCAP_RECORD_HEADER.create({
                inclLen: record.buffer.length,
                origLen: record.buffer.length,
                tsSec: Math.floor(record.time / 1000),
                tsUsec: (record.time % 1000) * 1000
            }).getBuffer(),
            record.buffer
        )

    }

    let file = new File(buffer, `${device.name}-${new Date().getTime()}.cap`, {
        "type": "application/cap",
    })

    let anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(file);
    anchor.download = file.name;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove()
}

export const TestingComponent2: Component = () => {
    let terminal: Terminal;

    let test_program: Program = {
        name: "test",
        init(proc, args) {
            proc.handle(proc, () => {
                proc.term_write(uint8_fromString("Cancelled"));
                proc.close(proc, ProcessSignal.EXIT);
            });

            let table = [
                ["Hello, World.", "I'm so sad i'm trying to get this to work. Am i being over-written?", "-0-"],
                ["Something", "Foo, Bar", "-1-"],
                ["Something", "Foo, Bar", "-3-"],
                ["Something", "Foo, Bar", "-4-"]
            ]

            proc.term_write(formatTable(table));

            setTimeout(() => {
                proc.term_write(uint8_fromString("Hello world Looser"));
                proc.close(proc, ProcessSignal.EXIT)
            }, 1000)

            return ProcessSignal.__EXPLICIT__;
        },
    }

    createEffect(() => {
        newdevice.terminal_attach(terminal);
        newdevice.process_start(DAEMON_SHELL, []);

    })


    let newdevice = new Device2();
    newdevice.programs.push(test_program)
    newdevice.name = "FIRETTE"
    let newdevice2 = new Device2();
    newdevice2.name = "HFDAN"
    let loopbackiface = new LoopbackInterface(newdevice);
    loopbackiface.start()
    newdevice.interface_add(loopbackiface)

    let etherinterface_1 = new EthernetInterface(newdevice, new MACAddress("fa-ff-0f-00-00-0c"));
    newdevice.interface_add(etherinterface_1);
    // testing of adding an address to an interface
    let etherinterface_1_ipv4_address = new IPV4Address("192.168.1.10")
    let etherinterface_1_ipv6_address = new IPV6Address("fe80::faff:0f00:000c:ba00")
    newdevice.interface_set_address(etherinterface_1, etherinterface_1_ipv4_address, createMask(IPV4Address, 24));
    newdevice.interface_set_address(etherinterface_1, etherinterface_1_ipv6_address, createMask(IPV6Address, 8));

    let etherinterface_2 = new EthernetInterface(newdevice2, new MACAddress("fa-ff-0f-00-00-0d"));
    newdevice2.interface_add(etherinterface_2)
    let etherinterface_2_ipv4_address = new IPV4Address("192.168.1.20")
    let etherinterface_2_ipv6_address = new IPV6Address("fe80::faff:0f00:000d:b778")
    newdevice2.interface_set_address(etherinterface_2, etherinterface_2_ipv4_address, createMask(IPV4Address, 24));
    newdevice2.interface_set_address(etherinterface_2, etherinterface_2_ipv6_address, createMask(IPV4Address, 8));

    let first_program: Program = {
        name: "problem",
        init(proc, args) {
            proc.term_write(sescape(args.join(" ")))
            return ProcessSignal.EXIT;
        }
    }

    newdevice.programs.push(first_program)
    let first_proc = newdevice.process_start(first_program, [])
    console.log(first_proc)

    etherinterface_1.connect(etherinterface_2)
    console.log(newdevice)

    let raw_contact_receiver: Parameters<Device2["contact_receive"]>[1] = (contact, data) => {
        // first test reply to echo request
        if (!data.rcvif) throw "rcvif is undefinded";

        // ASSUME THAT CHECKSUM WILL NEVER FAIL

        let iphdr = IPV4_HEADER.from(data.buffer);
        if (iphdr.get("proto") != PROTOCOLS.ICMP) {
            console.log(data.rcvif!.device.name, data.rcvif?.id(), data.broadcast, data.buffer.length)
            return;
        }

        let icmphdr = ICMP_HEADER.from(iphdr.get("payload"));

        if (icmphdr.get("type") == ICMPV4_TYPES.ECHO_REQUEST) {
            console.log(data.rcvif.device.name, "received an ipv4 echo request")

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
            let res = contact.send(contact, { buffer: iphdr.getBuffer() }, daddr);
            if (!res.success) {
                console.log(res.error, res.message)
            }
        } else if (icmphdr.get("type") == ICMPV4_TYPES.ECHO_REPLY) {
            console.log(data.rcvif.device.name, "received icmp echo reply")
        }


    }

    let raw_contact_device1 = newdevice.contact_create("IPv4", "RAW").data!;
    let raw_contact_device2 = newdevice2.contact_create("IPv4", "RAW").data!;
    raw_contact_device1.receive(raw_contact_device1, raw_contact_receiver)
    raw_contact_device2.receive(raw_contact_device2, raw_contact_receiver)

    let raw6_contact_device1 = newdevice.contact_create("IPv6", "RAW").data!;
    raw6_contact_device1.receive(raw6_contact_device1, (_, data) => {
        console.log(data)
    })

    function sescape(str: string): Uint8Array {
        return uint8_concat([
            new Uint8Array([ASCIICodes.Escape]),
            uint8_fromString(str),
        ])
    }

    function test_sending_ipv4(device: Device2, destination: IPV4Address) {
        console.log("%cSENDING ECHO TO: " + destination, "padding:1em; color:green; background: black;")

        let identifier = Math.floor(Math.random() * 0xfffe), sequence = 1;
        let echohdr = ICMP_ECHO_HEADER.create({
            id: identifier,
            seq: sequence,
        }), icmphdr = ICMP_HEADER.create({
            type: ICMPV4_TYPES.ECHO_REQUEST,
            data: echohdr.getBuffer()
        });

        icmphdr.set("csum", calculateChecksum(icmphdr.getBuffer()));

        let contact = device.contact_create("IPv4", "RAW")!.data;

        let iphdr = IPV4_HEADER.create({
            proto: PROTOCOLS.ICMP,
            payload: icmphdr.getBuffer()
        })

        let res = contact!.send(contact!, { buffer: iphdr.getBuffer() }, destination);
        if (!res.success) {
            console.log(res.error, res.message)
        }

        contact!.close(contact!);
    }

    function test_sending_ipv6(device: Device2, destination: IPV6Address) {
        let cres = device.contact_create("IPv6", "RAW");
        if (!cres.success) {
            console.log(cres.error, cres.message)
            return
        }
        console.log("%cSENDING ECHO TO: " + destination, "padding:1em; color:green; background: black;")

        let identifier = Math.floor(Math.random() * 0xfffe), sequence = 1;
        let echohdr = ICMP_ECHO_HEADER.create({
            id: identifier,
            seq: sequence,
        }), icmphdr = ICMP_HEADER.create({
            type: ICMPV6_TYPES.ECHO_REQUEST,
            data: echohdr.getBuffer(),
            csum: 0,
        });

        let route = device.route_resolve(destination);
        if (!route) return;
        let source = route.iface.addresses.find((v) => v.address.constructor == destination.constructor);
        if (!source) return;

        let pseudoHdr = IPV6_PSEUDO_HEADER.create({
            saddr: source.address as IPV6Address,
            daddr: destination,
            len: icmphdr.size,
            proto: PROTOCOLS.IPV6_ICMP,
        })

        icmphdr.set("csum", calculateChecksum(uint8_concat([
            pseudoHdr.getBuffer(),
            icmphdr.getBuffer()
        ])));

        let iphdr = IPV6_HEADER.create({ nextHeader: PROTOCOLS.IPV6_ICMP, payload: icmphdr.getBuffer() })
        let contact = cres.data;

        let res = contact.send(contact, { buffer: iphdr.getBuffer() }, destination, route);
        if (!res.success) {
            console.log(res.error, res.message)
        }
        contact.close(contact)
    }

    return (
        <div>
            <button onClick={() => {
                test_sending_ipv4(newdevice, new IPV4Address("127.0.23.2"))
            }}>test device 2</button>
            <button onClick={() => {
                test_sending_ipv4(newdevice2, etherinterface_1_ipv4_address)
            }}>test device 2 ether</button>
            <button onClick={() => {
                test_sending_ipv4(newdevice2, new IPV4Address("192.168.1.255"))
            }}>test device 2 ether broadcast</button>
            <button onClick={() => { test_sending_ipv6(newdevice2, etherinterface_1_ipv6_address) }}>ipv6 send</button>
            <button onClick={() => {
                window.setTimeout(() => downloadDevice2PCAP(newdevice), 150)
                // shell.read(sescape("echo hellow orlf looser\nhelp\ntest\necho cool"))
                // shell.read(CSI(...sescape("1;5H Hello World")))
            }}>dump commands</button>
            <div ref={(el) => {
                terminal = new Terminal(el)
            }}></div>

        </div>
    )
}