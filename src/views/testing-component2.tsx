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

    enum TCPState {
        CLOSED,
        LISTEN,
        SYN_RCVD,
        SYN_SENT,
        ESTABLISHED,
        FIN_WAIT_1,
        FIN_WAIT_2,
        CLOSING,
        TIME_WAIT,

        CLOSE_WAIT,
        LAST_ACK,
    }

    let tcp_server_contact = newdevice.contact_create("IPv4", "RAW").data!;
    let tcp_client_contact = newdevice.contact_create("IPv4", "RAW").data!;
    let tcp_server_seqnum = 0;
    let tcp_client_seqnum = ISN;

    let tcp_server_state = TCPState.LISTEN;
    let tcp_client_state = TCPState.CLOSED;

    function ipout(tcphdr: typeof TCP_HEADER) {
        let pseudohdr = IPV4_PSEUDO_HEADER.create({});
        newdevice.output_tcp({ buffer: uint8_concat([pseudohdr.getBuffer(), tcphdr.getBuffer()]) }, address)
    }

    function send_tcp4_syn() {
        let tcphdr = TCP_HEADER.create({
            sport: SPORT,
            dport: DPORT,
            seqnum: tcp_client_seqnum++,
            flags: TCP_FLAGS.SYN,
            window: 0xffff,

        });

        tcp_client_state = TCPState.SYN_SENT;

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

        tcp_client_state = TCPState.FIN_WAIT_1;
        ipout(tcphdr)
    }

    // !TODO: next do an active close


    tcp_server_contact.receive(tcp_server_contact, (_, data) => {
        let iphdr = IPV4_HEADER.from(data.buffer);
        if (iphdr.get("proto") != PROTOCOLS.TCP) return;

        let tcphdr = TCP_HEADER.from(iphdr.get("payload"));

        if (tcphdr.get("dport") != DPORT) return;

        let flags: number = 0;
        if (tcp_server_state == TCPState.LISTEN) {
            // reply with a syn+ack
            flags = TCP_FLAGS.SYN | TCP_FLAGS.ACK;
            tcp_server_state = TCPState.SYN_RCVD;
        } else if (tcp_server_state == TCPState.SYN_RCVD) {
            tcp_server_state = TCPState.ESTABLISHED;
            return;
        } else if (tcp_server_state == TCPState.ESTABLISHED) {
            flags = TCP_FLAGS.FIN | TCP_FLAGS.ACK;
            tcp_server_state = TCPState.LAST_ACK;
        } else if (tcp_server_state == TCPState.LAST_ACK) {
            // in actuality this should go into TIME_WAIT state
            tcp_client_state = TCPState.CLOSED;
            return;
        }
        tcphdr = tcphdr.create({
            sport: tcphdr.get("dport"),
            dport: tcphdr.get("sport"), // swap port numbers
            acknum: tcp_server_seqnum = (tcphdr.get("seqnum") + 1),
            flags: flags,
        })
        ipout(tcphdr)
    })

    tcp_client_contact.receive(tcp_client_contact, (_, data) => {
        let iphdr = IPV4_HEADER.from(data.buffer);
        if (iphdr.get("proto") != PROTOCOLS.TCP) return;

        let tcphdr = TCP_HEADER.from(iphdr.get("payload"));

        if (tcphdr.get("dport") != SPORT) return;
        let flags = 0;

        if (tcp_client_state == TCPState.SYN_SENT) {
            flags = TCP_FLAGS.ACK;
            tcp_client_state = TCPState.ESTABLISHED;
            // when i'm in the future send queued data
        }

        if (tcp_client_state == TCPState.FIN_WAIT_1) {
            if (tcphdr.get("flags") & TCP_FLAGS.FIN) {
                flags = TCP_FLAGS.ACK;
                if (tcphdr.get("flags") & TCP_FLAGS.ACK) {
                    // in actuality this should go into TIME_WAIT state
                    tcp_client_state = TCPState.CLOSED;
                } else {
                    tcp_client_state = TCPState.CLOSING;
                }

            } else if (tcphdr.get("flags") & TCP_FLAGS.ACK) {
                tcp_client_state = TCPState.FIN_WAIT_2;
                return;
            }
        } else if (tcp_client_state == TCPState.FIN_WAIT_2) {
            flags = TCP_FLAGS.ACK;
            // in actuality this should go into TIME_WAIT state
            tcp_client_state = TCPState.CLOSED;
        }



        // send an ack 
        tcphdr = tcphdr.create({
            sport: tcphdr.get("dport"),
            dport: tcphdr.get("sport"), // swap port numbers
            acknum: tcp_client_seqnum = (tcphdr.get("seqnum") + 1),
            flags: flags,
        })
        ipout(tcphdr)
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