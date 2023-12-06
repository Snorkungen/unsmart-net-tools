import { Component, createEffect } from "solid-js";
import Terminal, { TerminalRenderer } from "../lib/terminal/terminal";
import { uint8_concat, uint8_fromString } from "../lib/binary/uint8-array";
import { Device } from "../lib/device/device";
import Shell from "../lib/terminal/shell";
import { ASCIICodes, CSI } from "../lib/terminal/shared";
import { DEVICE_PROGRAM_CLEAR, DEVICE_PROGRAM_ECHO, DEVICE_PROGRAM_HELP } from "../lib/device/program/program";
import { DPSignal, DeviceProgramStatus } from "../lib/device/device-program";
import { formatTable } from "../lib/device/program/helpers";

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
                    return new Promise(r => r(DeviceProgramStatus.ERROR))
                },

            }
        ]
    })

    let shell = new Shell(device);
    console.log(device)

    createEffect(() => {
        shell.configureTerminal(terminal);
    })


    function sescape(str: string): Uint8Array {
        return uint8_concat([
            new Uint8Array([ASCIICodes.Escape]),
            uint8_fromString(str),
        ])
    }

    return (
        <div>
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