import { Component, createEffect } from "solid-js";
import { TerminalRenderer } from "../lib/terminal/terminal";
import { uint8_fromString } from "../lib/binary/uint8-array";


export const TestingComponent2: Component = () => {

    let terminalRenderer: TerminalRenderer;

    let bytes = uint8_fromString("A\tB\tC\bD\nE\tF \b\rG\n")


    function fooAnimate(bi = 0): void {
        if (bi > bytes.byteLength) {
            return;
        }


        terminalRenderer.buffer = bytes.slice(bi, bi + 1)
        terminalRenderer.render();

        window.setTimeout(() => fooAnimate(bi + 1), 1000)
    }

    createEffect(() => fooAnimate())


    return (
        <div>

            <div ref={(el) => {
                terminalRenderer = new TerminalRenderer(el)
            }}></div>

        </div>
    )
}