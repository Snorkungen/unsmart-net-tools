import { Component, createEffect } from "solid-js";
import Terminal, { TerminalRenderer } from "../lib/terminal/terminal";
import { Device, Process, ProcessSignal, Program } from "../lib/device/device";
import { DAEMON_SHELL } from "../lib/device/program/shell";
import { DEVICE_PROGRAM_PING } from "../lib/device/program/ping";
import { DEVICE_PROGRAM_CLEAR, DEVICE_PROGRAM_HELP, DEVICE_PROGRAM_DOWNLOAD, DEVICE_PROGRAM_ECHO } from "../lib/device/program/program";
import { DEVICE_PROGRAM_IFINFO } from "../lib/device/program/ifinfo";
import { DAEMON_ECHO_REPLIER } from "../lib/device/program/echo-replier";
import { LoopbackInterface, EthernetInterface } from "../lib/device/interface";
import { DEVICE_PROGRAM_ROUTEINFO } from "../lib/device/program/routeinfo";
import { uint8_concat, uint8_fromString } from "../lib/binary/uint8-array";
import { IPV4Address } from "../lib/address/ipv4";

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
        DEVICE_PROGRAM_ECHO, DEVICE_PROGRAM_DOWNLOAD, DEVICE_PROGRAM_IFINFO, DEVICE_PROGRAM_ROUTEINFO
    )

    // ADD ECHO REPLIER TO DEVICES
    newdevice.process_start(DAEMON_ECHO_REPLIER, [])

    const address = new IPV4Address("127.0.0.100");
    const DPORT = 5005;
    let tcp_server_contact = newdevice.contact_create("IPv4", "TCP").data!;
    let tcp_client_contact = newdevice.contact_create("IPv4", "TCP").data!;

    tcp_server_contact.bind(tcp_server_contact, {
        saddr: new IPV4Address("0.0.0.0"),
        daddr: new IPV4Address("0.0.0.0"),
        sport: DPORT,
        dport: 0
    });

    tcp_server_contact.listen(tcp_server_contact)

    function send_tcp4_syn() {
        tcp_client_contact.connect(tcp_client_contact, {
            daddr: address,
            dport: DPORT
        })

        console.log(newdevice, tcp_client_contact)
    }

    function send_tcp4_fin() {
        tcp_client_contact.close(tcp_client_contact)
    }

    return (
        <div>
            <button onclick={send_tcp4_syn}>OPEN TCP conn</button>
            <button onclick={send_tcp4_fin}>CLOSE TCP conn</button>
            <div ref={(el) => {
                terminal = new Terminal(el)
            }}></div>
        </div>
    )
}