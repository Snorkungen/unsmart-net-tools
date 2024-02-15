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
import { TCP_FLAGS, TCP_HEADER } from "../lib/header/tcp";
import { IPV4Address } from "../lib/address/ipv4";
import { IPV4_HEADER, IPV4_PSEUDO_HEADER, PROTOCOLS } from "../lib/header/ip";
import { calculateChecksum } from "../lib/binary/checksum";

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
    const ISN = 1_111_111 % 0xffffffff; // 32 bits
    const SPORT = 9009;
    const DPORT = 7007;
    let tcp_client_seqnum = ISN;

    function ipout(tcphdr: typeof TCP_HEADER) {
        tcphdr.set("doffset", tcphdr.size >> 2);
        let pseudohdr = IPV4_PSEUDO_HEADER.create({
            saddr: address,
            daddr: address,
            len: tcphdr.size,
            proto: PROTOCOLS.TCP,
        })

        tcphdr.set("csum", 0)
        tcphdr.set("csum", calculateChecksum(uint8_concat([pseudohdr.getBuffer(), tcphdr.getBuffer()])))

        let iphdr = IPV4_HEADER.create({
            saddr: address, daddr: address,
            proto: PROTOCOLS.TCP,
            payload: tcphdr.getBuffer()
        });

        newdevice.output_ipv4({ buffer: iphdr.getBuffer() }, address)
    }
    function send_tcp4_syn() {
        let tcphdr = TCP_HEADER.create({
            sport: SPORT,
            dport: DPORT,
            seqnum: tcp_client_seqnum++,
            flags: TCP_FLAGS.SYN,
            window: 0xffff,

        });
        ipout(tcphdr)
    }
    function send_tcp4_fin() {
        let tcphdr = TCP_HEADER.create({
            sport: SPORT,
            dport: DPORT,
            seqnum: tcp_client_seqnum,
            flags: TCP_FLAGS.FIN,
            window: 0xffff,
        });

        // !TODO: do an active close
        throw "not implemented"
    }
    
    // !TODO: next do an active close

    let tcp_server_contact = newdevice.contact_create("IPv4", "RAW").data!;
    let tcp_server_seqnum = 0;
    tcp_server_contact.receive(tcp_server_contact, (_, data) => {
        let iphdr = IPV4_HEADER.from(data.buffer);
        if (iphdr.get("proto") != PROTOCOLS.TCP) return;

        let tcphdr = TCP_HEADER.from(iphdr.get("payload"));

        if (tcphdr.get("dport") != DPORT) return;

        let flags: number;
        if (tcphdr.get("flags") & TCP_FLAGS.FIN) {
            flags = TCP_FLAGS.FIN | TCP_FLAGS.ACK;
        } else {
            flags = TCP_FLAGS.SYN | TCP_FLAGS.ACK;
        }


        // send a syn+ack 
        tcphdr = tcphdr.create({
            sport: tcphdr.get("dport"),
            dport: tcphdr.get("sport"), // swap port numbers
            acknum: tcp_server_seqnum = (tcphdr.get("seqnum") + 1),
            flags: flags,
        })
        ipout(tcphdr)
    })
    let tcp_client_contact = newdevice.contact_create("IPv4", "RAW").data!;
    tcp_client_contact.receive(tcp_client_contact, (_, data) => {
        let iphdr = IPV4_HEADER.from(data.buffer);
        if (iphdr.get("proto") != PROTOCOLS.TCP) return;

        let tcphdr = TCP_HEADER.from(iphdr.get("payload"));

        if (tcphdr.get("dport") != SPORT) return;

        // send an ack 
        tcphdr = tcphdr.create({
            sport: tcphdr.get("dport"),
            dport: tcphdr.get("sport"), // swap port numbers
            acknum: tcp_client_seqnum = (tcphdr.get("seqnum") + 1),
            flags: TCP_FLAGS.ACK,
        })
        ipout(tcphdr)
        tcp_client_contact.close(tcp_client_contact)
    })


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