import { Component } from "solid-js";
import { Device } from "../lib/device/device";


export const TTY: Component<{ device: Device }> = ({ device }) => {

    const ttyPrompt = `<${device.name}>`

    return <div>
        <textarea
            style={{ width: "100%" }}
            onKeyDown={(e) => {
                e.preventDefault();

                switch (e.key) {
                    case "Tab":
                        console.log("Tab pressed")
                        break;
                    case "Backspace":
                        if (e.currentTarget.textContent!.split("\n").at(-1) == ttyPrompt) break;
                        e.currentTarget.textContent = e.currentTarget.textContent!.substring(0, e.currentTarget.textContent!.length -1)
                        break;

                    case "Enter":
                        e.currentTarget.textContent += `\n${ttyPrompt}`;
                        e.currentTarget.scrollTop = e.currentTarget.scrollHeight;
                        break;

                    default:
                        if (e.key.length > 1) break;
                        e.currentTarget.textContent += e.key;
                }

            }}

        >
            {ttyPrompt}
        </textarea>
    </div>
}