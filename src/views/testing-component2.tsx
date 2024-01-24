import { Component, createEffect } from "solid-js";
import Terminal, { TerminalRenderer } from "../lib/terminal/terminal";
import { uint8_concat, uint8_fromString, uint8_mutateSet } from "../lib/binary/uint8-array";
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
import { createIPV4Header, PROTOCOLS } from "../lib/header/ip";
import { MACAddress } from "../lib/address/mac";
import { createMask } from "../lib/address/mask";
import { PCAP_GLOBAL_HEADER, PCAP_MAGIC_NUMBER, PCAP_RECORD_HEADER } from "../lib/header/pcap";

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

    let etherinterface_1 = new EthernetInterface(newdevice, new MACAddress("fa-ff-0f-00-00-0c"))
    newdevice.interfaces.push(etherinterface_1)
    let etherinterface_2 = new EthernetInterface(newdevice2, new MACAddress("fa-ff-0f-00-00-0d"));
    etherinterface_2.addresses.push({
        address: new IPV4Address("192.168.1.1"),
        netmask: createMask(IPV4Address, 24)
    })
    newdevice2.interfaces.push(etherinterface_2)

    etherinterface_1.connect(etherinterface_2)
    console.log(newdevice)

    function sescape(str: string): Uint8Array {
        return uint8_concat([
            new Uint8Array([ASCIICodes.Escape]),
            uint8_fromString(str),
        ])
    }

    return (
        <div>
            <button onClick={() => {

                let icmpHdr = ICMP_HEADER.create({
                    type: ICMPV4_TYPES.ECHO_REQUEST,
                    data: new Uint8Array([0, 0, 0, 1, 1, 1, 1, 1])
                });

                icmpHdr.set("csum", calculateChecksum(icmpHdr.getBuffer()));

                let ipHdr = createIPV4Header({
                    saddr: UNSET_IPV4_ADDRESS,
                    daddr: new IPV4Address("127.12.212.1"),
                    proto: PROTOCOLS.ICMP,
                    payload: icmpHdr.getBuffer()
                })

                loopbackiface.output({
                    type: "HEADER",
                    buffer: ipHdr.getBuffer()
                }, loopbackiface.addresses[0].address)
            }}>
                test device 2
            </button>
            <button onClick={() => {

                let icmpHdr = ICMP_HEADER.create({
                    type: ICMPV4_TYPES.ECHO_REQUEST,
                    data: new Uint8Array([0, 0, 0, 1, 1, 1, 1, 1])
                });

                icmpHdr.set("csum", calculateChecksum(icmpHdr.getBuffer()));

                let ipHdr = createIPV4Header({
                    saddr: new IPV4Address("192.168.1.10"),
                    daddr: new IPV4Address("192.168.1.1"),
                    proto: PROTOCOLS.ICMP,
                    payload: icmpHdr.getBuffer()
                })

                etherinterface_1.output({
                    type: "HEADER",
                    buffer: ipHdr.getBuffer(),
                },
                    new IPV4Address("192.168.1.1"),
                    {
                        destination: new IPV4Address("192.168.1.0"),
                        netmask: createMask(IPV4Address, 24),
                        iface: etherinterface_1,
                        gateway: new IPV4Address(new Uint8Array([0, 0, 0, 0])),

                    }
                )

                window.setTimeout(() => downloadDevice2PCAP(newdevice), 150)
            }}>
                test device 2 ether
            </button>
            <button onClick={() => {
                shell.read(sescape("echo hellow orlf looser\nhelp\ntest\necho cool"))
                // shell.read(CSI(...sescape("1;5H Hello World")))
            }}>dump commands</button>
            <div ref={(el) => {
                terminal = new Terminal(el)
            }}></div>

        </div>
    )
}