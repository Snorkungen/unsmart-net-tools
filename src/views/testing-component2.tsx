import { Component, createEffect } from "solid-js";
import Terminal, { ASCIICodes, TerminalRenderer } from "../lib/terminal/terminal";
import { uint8_concat, uint8_fromString } from "../lib/binary/uint8-array";


export const TestingComponent2: Component = () => {

    let terminal: Terminal;

    let bytes = uint8_fromString("A\tB\tC\bD\nE\tF \b\rG\n")

    createEffect(() => {

        terminal.read = (
            buf
        ) => {
            terminal.write(buf)
        }
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