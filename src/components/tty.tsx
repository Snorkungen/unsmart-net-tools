import { Component, createMemo } from "solid-js";
import { Device } from "../lib/device/device";
import { IPV4Address } from "../lib/address/ipv4";
import ping from "../lib/device/applications/ping";
import { Host } from "../lib/device/host";

type Program = (writer: (inp: string) => void, args: string) => Promise<number>;

function parseArgs(args: string): string[] {
    let argv: string[] = [];

    let p = 0, i = 0, c: string;
    while (p < args.length) {
        c = args[p];

        if (c == '"') {
            p++
            while (p < args.length) {
                c = args[p];

                if (c == '"') {
                    p++;
                    break;
                } else if (c) {
                    argv[i] ? argv[i] += c : argv[i] = c;
                }
                p++;
            }
            continue;
        } else if (c == " ") {
            i++;
        } else {
            argv[i] ? argv[i] += c : argv[i] = c;
        }

        p++;
    }

    return argv;
}

export const TTY: Component<{ device: Device }> = (props) => {
    const programs: Record<string, Program> = {
        "echo": (writer: (inp: string) => void, args: string) => new Promise(resolve => {
            cancel = () => { resolve(-1); writer = () => null }
            let argv = parseArgs(args);
            for (let a of argv.slice(1)) {
                writer(a)
            }
            resolve(0)
        }),
        "ifinfo": (writer) => new Promise(resolve => {
            cancel = () => { resolve(-1); writer = () => null }
            for (let iface of props.device.interfaces) {
                writer(iface.ifID + ":" + iface.macAddress);
                if (iface.ipv4Address) {
                    writer(":" + iface.ipv4Address.toString())
                    if (iface.ipv4SubnetMask) writer("/" + iface.ipv4SubnetMask.length)
                }
                if (iface.ipv6Address) {
                    writer(":" + iface.ipv6Address.toString())
                    typeof iface.prefixLength == "number" && writer("/" + iface.prefixLength)
                }
                writer("\n")
            }
            resolve(0);
        }),
        "ping": (writer: (inp: string) => void, args: string) => new Promise(async resolve => {
            let count = 10;
            cancel = () => { resolve(-1); writer = () => null; count = 0 };

            let [, target] = parseArgs(args);
            let tmp = props.device.interfaces[0].recvWait;
            props.device.interfaces[0].recvWait = 10;
            if (IPV4Address.validate(target)) {
                let addr = new IPV4Address(target)
                for (let i = 0; i < count; i++) {
                    await ping(props.device as Host, addr, 120, i).then(() => {
                        writer(`response ${target}: seq ${i}`)
                        i < 9 && writer("\n")
                    })
                }
            }

            props.device.interfaces[0].recvWait = tmp;
            resolve(0)
        })
    }

    let cancel: () => void = () => null;

    const ttyPrompt = createMemo(() => `<${props.device.name}>`);


    let entries: string[] = [], entryIndex = 0;
    let tabOptions: string[] = [], tabOptionsIndex = -1;

    return <div>
        <textarea
            rows={10}
            style={{ width: "100%" }}
            onKeyDown={(e) => {
                e.preventDefault();

                let elem = e.currentTarget;
                const writer = (text: string) => {
                    elem.textContent += text
                    elem.scrollTop = elem.scrollHeight;
                }
                let line = elem.textContent!.split("\n").at(-1)?.substring(ttyPrompt().length)
                const clearLine = () => {
                    elem.textContent = elem.textContent!.substring(0, elem.textContent!.length - line!.length!);
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

                        clearLine()
                        writer(tabOptions[tabOptionsIndex])

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
                        clearLine();
                        writer(entries[entryIndex])
                        break;
                    case "ArrowDown":
                        if (entryIndex < entries.length - 1) entryIndex++;
                        if (!entries[entryIndex]) break;
                        clearLine();
                        writer(entries[entryIndex])

                        break;

                    case "Enter":
                        entryIndex = entries.push(line!);
                        tabOptions = [], tabOptionsIndex = -1;

                        e.currentTarget.textContent += "\n";
                        e.currentTarget.scrollTop = e.currentTarget.scrollHeight;

                        let [key] = parseArgs(line!);
                        let f = programs[key]
                        if (typeof f == "function") {
                            f(writer, line!).then(() => {
                                writer("\n" + ttyPrompt())
                            })
                        } else {
                            writer(ttyPrompt())
                        }
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