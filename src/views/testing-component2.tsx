import { Component, createEffect } from "solid-js";
import Terminal, { TerminalRenderer } from "../lib/terminal/terminal";
import { uint8_concat, uint8_fromString } from "../lib/binary/uint8-array";
import { Device } from "../lib/device/device";
import Shell from "../lib/terminal/shell";
import { ASCIICodes } from "../lib/terminal/shared";


export const TestingComponent2: Component = () => {

    let terminal: Terminal;


    let device = new Device()
    device.name = "DEVICE-1"

    let shell = new Shell(device);

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

            <div ref={(el) => {
                terminal = new Terminal(el)
            }}></div>

        </div>
    )
}