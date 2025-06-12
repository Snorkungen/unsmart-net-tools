import { uint8_concat, uint8_equals, uint8_fromString } from "../../binary/uint8-array";
import { ASCIICodes, CSI, numbertonumbers } from "../../terminal/shared";
import { args_parse } from "../../utils/args-parse";
import { Device, Process, ProcessSignal, Program } from "../device";
import { ioclearline, ioreadline } from "./helpers";
import { termquery } from "./termquery";

class ShellHistory {
    private history: Uint8Array[] = [];
    private pos: number = -1;
    private last_is_committed = false;

    previous(): Uint8Array | null {
        if (this.pos <= 0) {
            return null;
        }

        return this.history.at(--this.pos) || null;
    }

    next(): Uint8Array | null {
        if (this.pos >= this.history.length - 1) {
            return null;
        }

        let v = this.history.at(++this.pos) || null

        if ((this.history.length - 1) == this.pos && v && !this.last_is_committed) {
            this.history.pop();
        }

        return v;
    }

    add(bytes: Uint8Array): boolean {
        if (this.history.length > 0 && uint8_equals(this.history[this.history.length - 1], bytes)) {
            this.pos = this.history.length;
            return false;
        }

        this.pos = this.history.push(bytes);
        this.last_is_committed = true;
        return true;
    }
    add_to_end(bytes: Uint8Array): boolean {
        if (this.history.length > 0 && uint8_equals(this.history[this.history.length - 1], bytes)) {
            return false;
        }

        if ((this.history.length - 1) != this.pos) {
            return false;
        }
        this.last_is_committed = false;
        this.history.push(bytes);
        return true;
    }
}

type ShellData = {
    history: ShellHistory;
    runningProc: Process | undefined;
};

function lazywriter_write_options(proc: Process<string>, options: string[], i: number, term_width: number) {
    let cursorX = 0;
    let option = options[i];

    let offsets = new Array<number>(options.length);
    let text_length = 0;
    for (let j = 0; j < options.length; j++) {
        offsets[j] = text_length;
        text_length += options[j].length + 1; // account for padding "Space"
    }
    text_length -= 1;

    let MAX_OPTIONS_WIDTH = term_width - 4;

    let options_start = 0, options_end = options.length - 1;

    if (MAX_OPTIONS_WIDTH < text_length) {
        // strategy for now is to create chunks

        let chunks: number[][] = [[]], k = 0;
        let visible_chunk = 0;
        let chunkbase = 0;
        for (let j = 0; j < offsets.length; j++) {
            if ((offsets[j] + options[j].length - chunkbase) >= MAX_OPTIONS_WIDTH) {
                chunks[++k] = [j];
                chunkbase = offsets[j];
            } else {
                chunks[k].push(j)
            }

            if (j === i) {
                visible_chunk = k;
            }
        }

        // modify values for the term_write loop
        options_start = chunks[visible_chunk][0];
        options_end = chunks[visible_chunk][chunks[visible_chunk].length - 1];
    }

    // move cursor & clear the row
    proc.io.write(CSI(...numbertonumbers(1), ASCIICodes.G, ...CSI(ASCIICodes.Two, ASCIICodes.K)))

    // display marker that there is more to the left
    if (options_start > 0) {
        proc.io.write(uint8_concat([
            CSI(ASCIICodes.Six + 1, ASCIICodes.m), // invert colours
            uint8_fromString("<"),
            CSI(ASCIICodes.Zero, ASCIICodes.m), // reset
            new Uint8Array([32])
        ])); /** the `TerminalRenderer` does not do the color properly at the moment */

        cursorX += 2;
    }

    for (let j = options_start; j <= options_end; j++) {
        option = options[j]
        if (j < i) {
            cursorX += option.length + 1;
        }

        if (j === i) {
            proc.io.write(uint8_concat([
                CSI(ASCIICodes.Six + 1, ASCIICodes.m), // invert colours
                uint8_fromString(option),
                CSI(ASCIICodes.Zero, ASCIICodes.m), // reset
                CSI(ASCIICodes.C)
            ]));
        } else {
            proc.io.write(uint8_fromString(option + " "))
        }
    }

    if (options_end < options.length - 1) {
        // indicate that there is more to the right
        proc.io.write(uint8_concat([
            CSI(...numbertonumbers(MAX_OPTIONS_WIDTH + 1), ASCIICodes.G), // move the cursor
            CSI(ASCIICodes.Six + 1, ASCIICodes.m), // invert colours
            uint8_fromString(">"),
            CSI(ASCIICodes.Zero, ASCIICodes.m), // reset
        ])); /** the `TerminalRenderer` does not do the color properly at the moment */

    }

    proc.io.write(CSI(...numbertonumbers(cursorX + 1), ASCIICodes.G))
}

function lazywriter_get_options(device: Device, args: string[]): string[] {
    if (args.length < 1) {
        args.push("");
        return device.programs.map(({ name }) => name);
    }

    let program = device.programs.find(({ name }) => name == args[0]);

    if (!program) {
        return device.programs.map(({ name }) => name).filter(name => name.startsWith(args[0]));
    }

    let add_new_arg = false;
    let options = new Set<string>();

    if (program.parameters) {
        for (let params of program.parameters.definition) {
            if (params.length < args.length) continue;
            let i = 0; while (++i < args.length) {
                if (!program.parameters.test(device, params[i], args[i])) {
                    break;
                }
            }

            let names: string[];
            let param = params[i];
            if (typeof param != "string") {
                if (param.keyword) {
                    names = [param.name];
                } else if (param.keywords) {
                    names = param.keywords
                } else {
                    continue;
                }
            } else {
                names = [param]
            }

            let arg = args[i];
            for (let name of names) {
                if (!arg || name.startsWith(arg)) {
                    options.add(name);
                    if (!arg) {
                        add_new_arg = true;
                    }
                }
            }
        }
    }

    if (add_new_arg) {
        args.push("")
    }

    return Array.from(options);
}

/**
 * 
 * This does not actually need to be a seperate program \
 * but it exists to experiment with how spawning programs could be used
 */
const lazywriter: Program<string> = {
    name: "shell_lazywriter",
    init(proc: Process<string>, _, data?: string | undefined): ProcessSignal {
        proc.data = data || ""; // set data
        let args = args_parse(proc.data);
        let options = lazywriter_get_options(proc.device, args);

        if (options.length == 0) {
            return ProcessSignal.EXIT; // do nothing
        }

        if (options.length == 1) {
            args[args.length - 1] = options[0]
            proc.data = args.join(" ") + " ";
            return ProcessSignal.EXIT;
        }

        let term_width = 38;
        let selected_option_idx = 0;
        proc.io.write(new Uint8Array([ASCIICodes.NewLine]));

        termquery(proc).then((data) => {
            if (data.width) {
                term_width = data.width;
            };
            lazywriter_write_options(proc, options, selected_option_idx, term_width);
        })

        proc.io.reader_add((bytes) => {
            let byte = bytes[0];

            if (
                byte === ASCIICodes.Space ||
                byte === ASCIICodes.NewLine ||
                byte === ASCIICodes.CarriageReturn
            ) {
                args[args.length - 1] = options[selected_option_idx]
                proc.data = args.join(" ") + " ";

                // move cursor to start clear line and go up on line
                proc.io.write(CSI(...numbertonumbers(1), ASCIICodes.G, ...CSI(ASCIICodes.Two, ASCIICodes.K), ...CSI(ASCIICodes.A)));
                proc.close(ProcessSignal.EXIT);
                return true;
            }

            if (
                byte === ASCIICodes.Escape && bytes.length === 1 ||
                byte === 3
            ) {
                proc.io.write(CSI(...numbertonumbers(1), ASCIICodes.G, ...CSI(ASCIICodes.Two, ASCIICodes.K), ...CSI(ASCIICodes.A)));
                proc.close(ProcessSignal.EXIT);
                return true;
            }


            if (byte === ASCIICodes.Escape && bytes[1] === ASCIICodes.OpenSquareBracket) {
                let finalByte = bytes[bytes.length - 1];

                if (finalByte === ASCIICodes.D || finalByte === ASCIICodes.B) { // ArrowLeft
                    if (selected_option_idx === 0)
                        selected_option_idx = options.length - 1;
                    else
                        selected_option_idx = selected_option_idx - 1;
                } else {
                    selected_option_idx = (selected_option_idx + 1) % options.length;
                }

                lazywriter_write_options(proc, options, selected_option_idx, term_width)
                return true;
            }

            selected_option_idx = (selected_option_idx + 1) % options.length;
            lazywriter_write_options(proc, options, selected_option_idx, term_width)
            return true;
        });

        return ProcessSignal.__EXPLICIT__;
    }
}

function get_prompt_buf(device: Device) {
    return uint8_concat([
        uint8_fromString("<"),
        CSI(ASCIICodes.Three, ASCIICodes.Three, ASCIICodes.m),
        uint8_fromString(device.name),
        CSI(ASCIICodes.Zero, ASCIICodes.m),
        uint8_fromString(">"),
    ]);
}

export const DAEMON_SHELL: Program<ShellData> = {
    name: "daemon_shell",
    async init(proc, _) {
        // just because i know the internals, but this is not obvious
        (<ShellData>proc.data) = {
            history: new ShellHistory(),
            runningProc: undefined
        };

        proc.device.io_terminal_attach(proc.io);

        proc.io.reader_add(bytes => {
            if (proc.data.runningProc) {
                proc.data.runningProc.io.read(bytes)
            }

            if (proc.data.runningProc && true /* Allow ctrl code checking to be toggled, default on */) {
                // read bytes and check for ctrl + c

                for (let i = 0; i < bytes.length; i++) {
                    let byte = bytes[i];

                    if (byte == 3) {
                        proc.data.runningProc.close(ProcessSignal.INTERRUPT);
                    }
                }
            }
        })

        let initial_bytes: undefined | Uint8Array = undefined;
        proc.io.write(new Uint8Array([10])); // initially write new line

        while (!proc.abort_controller.signal.aborted) {
            proc.io.write(get_prompt_buf(proc.device));
            let [bytes, target] = await ioreadline(proc.io, {
                targets: [
                    [ASCIICodes.Tab],
                    [ASCIICodes.Escape, ASCIICodes.OpenSquareBracket, ASCIICodes.A], // ArrowUp
                    [ASCIICodes.Escape, ASCIICodes.OpenSquareBracket, ASCIICodes.B], // ArrowDown
                    [3], // ctrl + C
                    [ASCIICodes.Escape], // Escape
                ],
                intial_bytes: initial_bytes
            });

            initial_bytes = undefined;
            let promptv = String.fromCharCode(...bytes);

            // check target
            if /* Enter pressed */ (target[0] == ASCIICodes.NewLine || target[0] == ASCIICodes.CarriageReturn) {
                let argv = args_parse(promptv);
                let name = argv.shift();
                let program: Program | undefined = proc.device.programs.find(p => p.name == name);

                if (program) {
                    proc.io.write(new Uint8Array([ASCIICodes.NewLine]));
                    // run program async
                    await new Promise<void>((resolve, reject) => {
                        try {
                            proc.data.runningProc = proc.spawn(program, args_parse(promptv), undefined, {
                                on_close(_, status) {
                                    delete (<ShellData>proc.data).runningProc;
                                    resolve();
                                },
                                io_on_write(bytes) {
                                    proc.io.write(bytes)
                                },
                                io_on_flush() {
                                    proc.io.flush()
                                }
                            });
                        } catch (error) {
                            reject(error);
                            // !TODO: possibly do something better when spawned program errors
                        }
                    })

                }

                if (promptv) {
                    proc.data.history.add(bytes);
                }
            }  /* Tab pressed */ else if (target[0] == ASCIICodes.Tab) {
                let v = await new Promise<string | undefined>(resolve => {
                    proc.data.runningProc = proc.spawn(lazywriter, undefined, promptv, {
                        on_close(sproc) {
                            delete proc.data.runningProc
                            resolve(sproc.data)
                        },
                        io_on_write(bytes) {
                            proc.io.write(bytes)
                        },
                        io_on_flush() {
                            proc.io.flush()
                        }
                    });
                });

                if (v) {
                    initial_bytes = uint8_fromString(v);
                } else {
                    initial_bytes = bytes;
                }
                ioclearline(proc.io);
                continue;
            }  /* ctrl + c pressed or escape */ else if (target[0] == 3 || (target.length == 1 && target[0] == ASCIICodes.Escape)) {
                ioclearline(proc.io);
                continue;
            } /* ArrowUp pressed  */ else if (target[0] == ASCIICodes.Escape && target.at(-1)! == ASCIICodes.A) {
                let prev = proc.data.history.previous();
                if (prev != null) {
                    initial_bytes = prev;

                    proc.data.history.add_to_end(bytes)
                } else {
                    initial_bytes = bytes;
                }
                ioclearline(proc.io);
                continue;
            } /* ArrowDown pressed  */ else if (target[0] == ASCIICodes.Escape && target.at(-1)! == ASCIICodes.B) {
                let next = proc.data.history.next();
                if (next != null) {
                    initial_bytes = next;
                } else {
                    initial_bytes = bytes;
                }
                ioclearline(proc.io);
                continue;
            }

            // Finally write a new line
            proc.io.write(new Uint8Array([10]));
        }

        return ProcessSignal.EXIT;
    }
}