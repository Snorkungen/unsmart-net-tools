import { Component, createMemo } from "solid-js";
import { Device } from "../lib/device/device";

import { registerTTYPrograms, parseArgs, resolveTTYProgram, TTYWriter } from "../lib/tty/program/";

export const TTY: Component<{ device: Device }> = (props) => {
    const programs = registerTTYPrograms();

    let cancel: () => void = () => null;

    const ttyPrompt = createMemo(() => `<${props.device.name}>`);


    let entries: string[] = [], entryIndex = 0;
    let tabOptions: string[] = [], tabOptionsIndex = -1;

    return <div>
        <textarea
            rows={10}
            style={{ width: "100%", "font-family": "monospace" }}
            onKeyDown={(e) => {
                e.preventDefault();

                let elem = e.currentTarget;
                let line = elem.textContent!.split("\n").at(-1)?.substring(ttyPrompt().length)

                const writer: TTYWriter = {
                    write: (text: string) => {
                        elem.textContent += text
                        elem.scrollTop = elem.scrollHeight;
                    },

                    clear() { elem.textContent = "tty cleared!" },
                    clearLine() {
                        elem.textContent = elem.textContent!.substring(0, elem.textContent!.length - line!.length!);
                    }
                }



                if (e.ctrlKey && e.key.toLowerCase() == "c") {
                    cancel()
                }

                switch (e.key) {
                    case "Tab":
                        if (tabOptionsIndex < 0 && line) {
                            // calculate options
                            if (line.length < 1 || line.includes(" ")) {
                                break;
                            }

                            tabOptions = Object.keys(programs).reduce<string[]>((options, key) => {
                                let b = true;
                                for (let i = 0; i < line!.length; i++) {
                                    if (line![i] != key[i]) {
                                        b = false;
                                        break;
                                    }
                                }

                                if (b) options.push(key);
                                return options;
                            }, []);
                            tabOptionsIndex = 0;
                        }
                        if (tabOptions.length <= 0) break;

                        writer.clearLine();
                        writer.write(tabOptions[tabOptionsIndex])

                        if (tabOptionsIndex < tabOptions.length - 1) {
                            tabOptionsIndex++;
                        } else {
                            tabOptionsIndex = 0;
                        }

                        break;
                    case "Backspace":
                        if (e.currentTarget.textContent!.split("\n").at(-1) == ttyPrompt()) break;
                        e.currentTarget.textContent = e.currentTarget.textContent!.substring(0, e.currentTarget.textContent!.length - 1)
                        break;

                    case "ArrowUp":
                        if (entryIndex > 0) entryIndex--;
                        if (!entries[entryIndex]) break;

                        writer.clearLine();
                        writer.write(entries[entryIndex])
                        break;
                    case "ArrowDown":
                        if (entryIndex < entries.length - 1) entryIndex++;
                        if (!entries[entryIndex]) break;
                        writer.clearLine();
                        writer.write(entries[entryIndex])

                        break;

                    case "Enter":
                        entryIndex = entries.push(line!);
                        tabOptions = [], tabOptionsIndex = -1;

                        e.currentTarget.textContent += "\n";
                        e.currentTarget.scrollTop = e.currentTarget.scrollHeight;

                        let [key] = parseArgs(line!),
                            entry = resolveTTYProgram(programs[key], line!);

                        if (!entry) {
                            writer.write(ttyPrompt());
                            break;
                        }

                        let prog = entry(writer, props.device, programs);

                        cancel = prog.cancel
                        prog.run(line!)
                            .then(_ => writer.write("\n" + ttyPrompt()))
                            .catch(e => { console.error(e); writer.write("\n" + ttyPrompt()) })

                        break;

                    default:
                        if (e.key.length > 1) break;
                        e.currentTarget.textContent += e.key;
                }

            }}

        >
            {ttyPrompt()}
        </textarea>
    </div >
}