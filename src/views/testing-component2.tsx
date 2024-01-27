import { Component, createEffect } from "solid-js";
import Terminal, { TerminalRenderer } from "../lib/terminal/terminal";
import { uint8_concat, uint8_fromNumber, uint8_fromString, uint8_mutateSet, uint8_readUint32BE } from "../lib/binary/uint8-array";
import { Device } from "../lib/device/device";
import Shell from "../lib/terminal/shell";
import { ASCIICodes, CSI } from "../lib/terminal/shared";
import { DEVICE_PROGRAM_CLEAR, DEVICE_PROGRAM_ECHO, DEVICE_PROGRAM_HELP } from "../lib/device/program/program";
import { DPSignal, DeviceProgramStatus } from "../lib/device/device-program";
import { formatTable } from "../lib/device/program/helpers";
import { Device2, EthernetInterface, LoopbackInterface } from "../lib/device/device2";
import { ICMPV4_TYPES, ICMP_HEADER } from "../lib/header/icmp";
import { IPV4Address } from "../lib/address/ipv4";
import { calculateChecksum } from "../lib/binary/checksum";
import { UNSET_IPV4_ADDRESS } from "../lib/device/contact/contacts-handler";
import { createIPV4Header, IPV4_HEADER, PROTOCOLS } from "../lib/header/ip";
import { MACAddress } from "../lib/address/mac";
import { createMask } from "../lib/address/mask";
import { PCAP_GLOBAL_HEADER, PCAP_MAGIC_NUMBER, PCAP_RECORD_HEADER } from "../lib/header/pcap";
import { BaseAddress } from "../lib/address/base";

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

    // join buffers
    // let totalLength = buffer.reduce((sum, b) => sum + b.byteLength, 0)
    // let bytes = new Uint8Array(totalLength);
    // let offset = 0, bi = 0;

    // while (offset < totalLength && bi < buffer.length) {
    //     uint8_mutateSet(bytes, buffer[bi], offset);
    //     offset += buffer[bi].byteLength
    //     bi += 1
    // }

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
    let device = new Device()
    device.name = "DEVICE-1"

    device.registerProgram(DEVICE_PROGRAM_CLEAR)
    device.registerProgram(DEVICE_PROGRAM_ECHO)
    device.registerProgram(DEVICE_PROGRAM_HELP)
    device.registerProgram({
        name: "test",
        run: function (args: string, { terminal, signal }): Promise<DeviceProgramStatus> {
            return new Promise<DeviceProgramStatus>((resolve) => {
                signal.on(DPSignal.TERMINATE, () => {
                    terminal.write(uint8_fromString("Cancelled"))
                    resolve(DeviceProgramStatus.OK);
                })

                let table = [
                    ["Hello, World.", "I'm so sad i'm trying to get this to work. Am i being over-written?", "-0-"],
                    ["Something", "Foo, Bar", "-1-"],
                    ["Something", "Foo, Bar", "-3-"],
                    ["Something", "Foo, Bar", "-4-"]
                ]

                terminal.write(formatTable(table))

                setTimeout(() => {
                    terminal.write(sescape("Hello world Looser"))
                    resolve(DeviceProgramStatus.OK)
                }, 1000)
            })
        },
        sub: [
            {
                name: "TEst Sub",
                run(args, options) {
                    options.terminal.write(new Uint8Array([65, 65, 66, 66, 67, 67.68]))
                    return new Promise(r => r(DeviceProgramStatus.ERROR))
                },

            }
        ]
    })

    let shell = new Shell(device);

    createEffect(() => {
        shell.configureTerminal(terminal);
    })


    let newdevice = new Device2();
    newdevice.name = "FIRETTE"
    let newdevice2 = new Device2();
    newdevice2.name = "HFDAN"
    let loopbackiface = new LoopbackInterface(newdevice);
    loopbackiface.start()
    newdevice.interfaces.push(loopbackiface)

    let etherinterface_1 = new EthernetInterface(newdevice, new MACAddress("fa-ff-0f-00-00-0c"));
    newdevice.interfaces.push(etherinterface_1);
    // testing of adding an address to an interface
    let etherinterface_1_ipv4_address = new IPV4Address("192.168.1.10")
    newdevice.interface_set_address(etherinterface_1, etherinterface_1_ipv4_address, createMask(IPV4Address, 24));
    
    let etherinterface_2 = new EthernetInterface(newdevice2, new MACAddress("fa-ff-0f-00-00-0d"));
    newdevice2.interfaces.push(etherinterface_2)
    let etherinterface_2_ipv4_address = new IPV4Address("192.168.1.20")
    newdevice2.interface_set_address(etherinterface_2, etherinterface_2_ipv4_address, createMask(IPV4Address, 24));

    etherinterface_1.connect(etherinterface_2)
    console.log(newdevice)

    function sescape(str: string): Uint8Array {
        return uint8_concat([
            new Uint8Array([ASCIICodes.Escape]),
            uint8_fromString(str),
        ])
    }

    function test_sending_ipv4 (device: Device2, destination: BaseAddress) {
        let icmpHdr = ICMP_HEADER.create({
            type: ICMPV4_TYPES.ECHO_REQUEST,
            data: new Uint8Array([0, 0, 0, 1, 1, 1, 1, 1])
        });

        icmpHdr.set("csum", calculateChecksum(icmpHdr.getBuffer()))

        let ipHdr = IPV4_HEADER.create({
            proto: PROTOCOLS.ICMP,
            payload: icmpHdr.getBuffer()
        });

        let err = device.output_ipv4(ipHdr, destination)
        if (err.status) {
            console.log(err.error, err.message)
        }
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
            <button onClick={() => {
                window.setTimeout(() => downloadDevice2PCAP(newdevice), 150)
                shell.read(sescape("echo hellow orlf looser\nhelp\ntest\necho cool"))
                // shell.read(CSI(...sescape("1;5H Hello World")))
            }}>dump commands</button>
            <div ref={(el) => {
                terminal = new Terminal(el)
            }}></div>

        </div>
    )
}