import { Component, createEffect } from "solid-js";
import Terminal from "../lib/terminal/terminal";
import { Device } from "../lib/device/device";
import { DAEMON_SHELL } from "../lib/device/program/shell";
import { DEVICE_PROGRAM_PING } from "../lib/device/program/ping";
import { DEVICE_PROGRAM_CLEAR, DEVICE_PROGRAM_HELP, DEVICE_PROGRAM_DOWNLOAD, DEVICE_PROGRAM_ECHO } from "../lib/device/program/program";
import { DEVICE_PROGRAM_IFINFO } from "../lib/device/program/ifinfo";
import { DAEMON_ECHO_REPLIER } from "../lib/device/program/echo-replier";
import { LoopbackInterface } from "../lib/device/interface";
import { DEVICE_PROGRAM_ROUTEINFO } from "../lib/device/program/routeinfo";
import { uint8_equals, uint8_fromString } from "../lib/binary/uint8-array";
import { OSInterface } from "../lib/device/osinterface";
import { IPV4Address } from "../lib/address/ipv4";
import { createMask } from "../lib/address/mask";
import { calculateChecksum } from "../lib/binary/checksum";
import { ICMP_ECHO_HEADER, ICMPV4_TYPES, ICMP_HEADER } from "../lib/header/icmp";
import { IPV4_HEADER, PROTOCOLS, createIPV4Header } from "../lib/header/ip";
import { DEVICE_PROGRAM_DAEMAN } from "../lib/device/program/daeman";
import { ASCIICodes } from "../lib/terminal/shared";
import { terminal_resize } from "../lib/terminal/renderer";
import { DEVICE_PROGRAM_TRACEROUTE } from "../lib/device/program/traceroute";
import { DEVICE_PROGRAM_HOSTSINFO, setaddress_by_host } from "../lib/device/program/hostsinfo";

export const TestingComponent2: Component = () => {
    let terminal: Terminal;

    createEffect(() => {
        terminal.write(uint8_fromString("Hello wte"))
        newdevice.terminal_attach(terminal);
        newdevice.process_start(DAEMON_SHELL, []);
    });

    let newdevice = new Device();
    newdevice.name = "FIRETTE"
    let loopbackiface = newdevice.interface_add(new LoopbackInterface(newdevice)); loopbackiface.start();
    // add all my programs to the device
    newdevice.programs.push(
        DEVICE_PROGRAM_PING, DEVICE_PROGRAM_CLEAR, DEVICE_PROGRAM_HELP,
        DEVICE_PROGRAM_ECHO, DEVICE_PROGRAM_DOWNLOAD, DEVICE_PROGRAM_IFINFO, DEVICE_PROGRAM_ROUTEINFO,

        DEVICE_PROGRAM_DAEMAN,
        DEVICE_PROGRAM_HOSTSINFO,
        DEVICE_PROGRAM_TRACEROUTE,
    )

    // ADD ECHO REPLIER TO DEVICES
    newdevice.process_start(DAEMON_ECHO_REPLIER, [])

    let osif = newdevice.interface_add(new OSInterface(newdevice))
    const osif_destination = new IPV4Address("10.1.1.40");
    const osif_dport = 10011;
    newdevice.interface_address_set(osif, new IPV4Address("10.1.1.100"), createMask(IPV4Address, 16))
    setaddress_by_host(newdevice, "remote.osif", osif_destination)


    function send_ping() {
        function success() {
            console.log("%c ECHO Reply recieved: " + newdevice.name, ['background: green', 'color: white', 'display: block', 'text-align: center', 'font-size: 24px'].join(';'))
        }
        let identifier = Math.floor(Math.random() * 1_000), sequence = 1;

        let echoHdr = ICMP_ECHO_HEADER.create({
            id: identifier,
            seq: sequence
        })
        let ip = osif_destination;
        let destination = new IPV4Address(ip)

        let contact = newdevice.contact_create("IPv4", "RAW").data!;
        contact.receive((_, data) => {
            let iphdr = IPV4_HEADER.from(data.buffer);
            if (!uint8_equals(iphdr.get("saddr").buffer, destination.buffer)) return;
            if (iphdr.get("proto") != PROTOCOLS.ICMP) return;
            if (iphdr.get("payload")[0] != ICMPV4_TYPES.ECHO_REPLY) return;
            contact.close();
            success()
        })

        let icmpHdr = ICMP_HEADER.create({
            type: ICMPV4_TYPES.ECHO_REQUEST,
            data: echoHdr.getBuffer()
        });

        icmpHdr.set("csum", calculateChecksum(icmpHdr.getBuffer()));

        let ipHdr = createIPV4Header({
            saddr: new IPV4Address("0.0.0.0"),
            daddr: new IPV4Address(ip),
            proto: PROTOCOLS.ICMP,
            payload: icmpHdr.getBuffer()
        })

        contact.send({ buffer: ipHdr.getBuffer() }, ipHdr.get("daddr"));
    }

    function send_udp() {
        let contact = newdevice.contact_create("IPv4", "UDP").data!;

        contact.sendTo({
            buffer: new Uint8Array([
                0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x55, 0x44, 0x50, 0x20, 0x53, 0x65, 0x72, 0x76, 0x65, 0x72
            ])

        }, {
            dport: osif_dport,
            daddr: osif_destination
        });

        contact.receive((_, d) => {
            let string = new TextDecoder("utf-8").decode(d.buffer);
            console.log(string);
        }, {})
    }

    function connect_tcp() {
        let contact = newdevice.contact_create("IPv4", "TCP").data!;

        contact.connect({
            daddr: osif_destination,
            dport: osif_dport
        });

        contact.on_error(() => {
            console.log("failed to connect to destination")
        })

        contact.receive((_, d) => {
            let string = new TextDecoder("utf-8").decode(d.buffer);
            console.log(string);

            contact.send({ buffer: uint8_fromString(string + " --reply") });
            contact.close()
        }, {})
    }

    function fill_terminal_with_junk() {
        let n = 55;
        for (let i = 0; i < n; i++) {
            terminal.write(uint8_fromString(`Hello, World ${i + 1}\n`), false);
        }
        terminal.read!(new Uint8Array([10]))
    }

    function change_terminal_size(size = 30) {
        terminal.renderer.view_columns = size;
        terminal_resize(terminal.renderer);
        terminal.renderer.ctx.fillRect(0, 0, terminal.renderer.canvas.width, terminal.renderer.canvas.width)
        terminal.renderer.draw()
    }

    return (
        <div>
            <button onclick={() => osif.start()}>start osif</button>
            <button onclick={send_ping}>send packet over wire</button>
            <button onclick={send_udp}>send udp packet over wire</button>
            <button onclick={connect_tcp}>connect tcp</button>
            <div>
                <button onclick={fill_terminal_with_junk}>Junk</button>
                <button onclick={() => terminal.write(new Uint8Array([
                    ASCIICodes.Escape, ASCIICodes.OpenSquareBracket, ASCIICodes.One, ASCIICodes.A
                ]))}>Up</button>
                <button onclick={() => (terminal.write(new Uint8Array([
                    ASCIICodes.Escape, ASCIICodes.OpenSquareBracket, ASCIICodes.One, ASCIICodes.B
                ])))}>Down</button>
                <button onclick={() => change_terminal_size(30)}>resize -</button>
                <button onclick={() => change_terminal_size(90)}>resize +</button>
                <button onclick={() => console.log(terminal.renderer.rows, terminal.renderer.resize_markers)}>dump</button>
            </div>
            <div ref={(el) => {
                terminal = new Terminal(el)
            }}></div>
        </div >
    )
}