import { Component, createEffect } from "solid-js";
import Terminal, { TerminalRenderer } from "../lib/terminal/terminal";
import { uint8_concat, uint8_fromString } from "../lib/binary/uint8-array";
import { Device } from "../lib/device/device";
import Shell from "../lib/terminal/shell";
import { ASCIICodes } from "../lib/terminal/shared";
import { DEVICE_PROGRAM_CLEAR, DEVICE_PROGRAM_ECHO, DEVICE_PROGRAM_HELP } from "../lib/device/program";
import { DPSignal, DeviceProgramStatus } from "../lib/device/device-program";

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
                    resolve(DeviceProgramStatus.OK);
                    console.log("Canned")
                })
                
                setTimeout(() => {
                    terminal.write(sescape("Hello world Looser"))
                    resolve(DeviceProgramStatus.OK)
                }, 1000)
            })
        }
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
            }}>dump commands</button>
            <div ref={(el) => {
                terminal = new Terminal(el)
            }}></div>

        </div>
    )
}