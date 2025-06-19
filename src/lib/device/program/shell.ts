import { uint8_concat, uint8_equals, uint8_fromString } from "../../binary/uint8-array";
import { ASCIICodes, CSI, numbertonumbers } from "../../terminal/shared";
import { args_parse, args_parse_ext } from "../../utils/args-parse";
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
                uint8_fromString(option.slice(0, 1)), // !NOTE: this weird thing is to avoid the cursor covering the value ...
                CSI(ASCIICodes.Six + 1, ASCIICodes.m), // invert colours
                uint8_fromString(option.slice(1)),
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

function lazywriter_get_options(device: Device, args: string[]): { options: string[], idx: number } {
    if (args.length < 1) {
        args.push("");
        return {
            options: device.programs.map(({ name }) => name),
            idx: 0
        };
    }

    let program = device.programs.find(({ name }) => name == args[0]);

    if (!program) {
        return {
            options: device.programs.map(({ name }) => name).filter(name => name.startsWith(args[0])),
            idx: 0,
        };
    }

    if (!program.parameters) {
        return {
            options: [],
            idx: 1,
        }
    }

    const options = new Set<string>();
    const definition = program.parameters.definition;
    const passed = new Array<number>(definition.length).fill(0);
    let matches = 0;
    let i = 0;

    for (; i < args.length; i++) {
        matches = 0;

        for (let j = 0; j < definition.length; j++) {
            let params = definition[j];

            if (params.length < i || passed[j] < i) {
                continue
            } else if (program.parameters.test(device, params[i], args[i])) {
                passed[j] += 1;
                matches += 1;
            }
        }

        if (matches === 0) {
            break;
        }
    }

    let parameters_left = (i == 0 ? definition : definition.filter((_, j) => passed[j] >= i))
        .sort((a, b) => a.length - b.length); // sort ascending

    let arg = args[i];
    for (let params of parameters_left) {
        if (i >= params.length) {
            continue;
        }

        let param = params[i];

        if (typeof param == "string") {
            if ((!arg || param.startsWith(arg))) {
                options.add(param);
            }
        } else if (param.keyword && (!arg || param.name.startsWith(arg))) {
            options.add(param.name);
        } else if (param.keywords) {
            for (let keyword of param.keywords) {
                if (!arg || keyword.startsWith(arg)) {
                    options.add(keyword);
                }
            }
        }
    }

    return {
        options: Array.from(options),
        idx: i
    }
}

/**  this function does not return anything but it, moves the curso and things ... */
export async function lazywriter2(proc: Process, input: string, x_cursor: number = input.length): Promise<string | undefined> {
    const { args, active } = args_parse_ext(input, x_cursor);
    const { options, idx } = lazywriter_get_options(proc.device, args.slice(0, active < 0 ? args.length : active + 1))

    if (options.length === 0) {
        // return early nothing to do ...
        return undefined;
    }

    if (active >= 0 && active > idx) {
        // this is a case where I want nothing to be done ...
        return undefined;
    }

    if (idx >= args.length) {
        args.push("")
    }

    if (options.length === 1) {
        args[idx] = options[0]
        return args.join(" ")
    }

    let selected = 0;
    const tq = await termquery(proc);
    const columns = tq.width || 38;

    proc.io.write(CSI(ASCIICodes.E))
    ioclearline(proc.io);
    return new Promise(resolve => {
        let reader = proc.io.reader_add((bytes) => {
            let byte = bytes[0];

            if (
                byte === ASCIICodes.Space ||
                byte === ASCIICodes.NewLine ||
                byte === ASCIICodes.CarriageReturn
            ) {
                proc.io.reader_remove(reader);
                ioclearline(proc.io);
                proc.io.write(CSI(ASCIICodes.F))

                args[idx] = options[selected]
                resolve(args.join(" "))
            }

            if (
                byte === ASCIICodes.Escape && bytes.length === 1 ||
                byte === 3
            ) {
                proc.io.reader_remove(reader);
                ioclearline(proc.io);
                proc.io.write(CSI(ASCIICodes.F))

                return resolve(input);
            }

            if (byte === ASCIICodes.Escape && bytes[1] === ASCIICodes.OpenSquareBracket) {
                let finalByte = bytes[bytes.length - 1];

                if (finalByte === ASCIICodes.D || finalByte === ASCIICodes.B) { // ArrowLeft
                    if (selected === 0)
                        selected = options.length - 1;
                    else
                        selected = selected - 1;
                } else {
                    selected = (selected + 1) % options.length;
                }

                lazywriter_write_options(proc, options, selected, columns)
                return true;
            }

            selected = (selected + 1) % options.length;
            lazywriter_write_options(proc, options, selected, columns)
        })

        lazywriter_write_options(proc, options, selected, columns)
    })
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
            let [bytes, target, x_cursor] = await ioreadline(proc.io, {
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
                let v = await lazywriter2(proc, promptv, x_cursor)
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