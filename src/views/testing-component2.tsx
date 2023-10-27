import { Component, createEffect } from "solid-js";
import { ASCIICodes, TerminalRenderer } from "../lib/terminal/terminal";
import { uint8_concat, uint8_fromString } from "../lib/binary/uint8-array";


export const TestingComponent2: Component = () => {

    let terminalRenderer: TerminalRenderer;

    // let bytes = uint8_fromString("A\tB\tC\bD\nE\tF \b\rG\n")


    // function fooAnimate(bi = 0): void {
    //     if (bi > bytes.byteLength) {
    //         return;
    //     }


    //     terminalRenderer.buffer = bytes.slice(bi, bi + 1)
    //     terminalRenderer.render();

    //     window.setTimeout(() => fooAnimate(bi + 1), 1000)
    // }

    // createEffect(() => fooAnimate())

    function sescape(str: string): Uint8Array {
        return uint8_concat([
            new Uint8Array([ASCIICodes.Escape]),
            uint8_fromString(str),
        ])
    }

    createEffect(() => {
        terminalRenderer.buffer = uint8_concat([
            sescape("[;B"),
            uint8_fromString("Hello World"),
            sescape("[;B"),
            sescape("[;A"),
            sescape("[;C"),
            sescape("[;D"),
            uint8_fromString("Hello World"),
            sescape("[2E"),
            uint8_fromString("Hello World"),
            sescape("[F"),
            uint8_fromString("Hello World"),
            sescape("[1B"),
            sescape("[4G"),
            uint8_fromString("_______"),
        ])
        terminalRenderer.render();

    })

    return (
        <div>

            <div ref={(el) => {
                terminalRenderer = new TerminalRenderer(el)
            }}></div>

        </div>
    )
}