import { Component, createEffect, createMemo } from "solid-js";
import { Device } from "../lib/device/device";

import { registerTTYPrograms, parseArgs, resolveTTYProgram, TTYWriter, TTYProgramInitializer, TTYPrograms, TTYProgram, createTTYProgram, TTYProgramStatus } from "../lib/tty/program/";
import { TTYStateManager } from "../lib/tty/state";

export const TTY: Component<{ device: Device }> = (props) => {
    const programs = registerTTYPrograms();

    // Test Program
    programs.ego = tp

    let stateManager = new TTYStateManager(document.createElement("textarea"), props.device, programs);
    createEffect(() => {
        stateManager.device = props.device;
    })

    const ttyPrompt = createMemo(() => `<${props.device.name}>`);

    return <div>
        <textarea
            ref={e => {
                stateManager.elem = e;
                stateManager.elem.addEventListener("keydown", stateManager.onKeyDown.bind(stateManager));
            }}
            spellcheck={false} autocapitalize="off" autocomplete="off"
            rows={10}
            style={{ width: "100%", "font-family": "monospace" }}

        >
            {ttyPrompt()}
        </textarea>
    </div >
}

let tp = createTTYProgram(writer => ({
    cancel() { },
    run(args) {
        return new Promise(resolve => {
            this.cancel = () => {
                resolve (TTYProgramStatus.CANCELED);
                console.log("cancelled")
            }
            setTimeout(() => 
            resolve(TTYProgramStatus.OK)
            
            , 1000)
        })
    },
}), {
    about: {
        description: "TestProgram",
        content: "fdjskl"
    }
})