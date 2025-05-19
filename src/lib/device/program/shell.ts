import { uint8_concat, uint8_fromString } from "../../binary/uint8-array";
import { ASCIICodes, CSI, numbertonumbers, readParams } from "../../terminal/shared";
import { Process, ProcessSignal, Program } from "../device";
import { parseArgs } from "./helpers";
import { DEVICE_PROGRAM_TERMQUERY } from "./termquery";

enum ShellState {
    UNITIALIZED,
    PROMPT,
    RUNNING_PROGRAM,
    LAZY_WRITING
}

class ShellHistory {
    private history: string[] = [];
    private pos: number = -1;

    previous(): string | null {
        if (this.pos <= 0) {
            return null;
        }

        return this.history.at(--this.pos) || null;
    }

    next(): string | null {
        if (this.pos >= this.history.length - 1) {
            return null;
        }

        return this.history.at(++this.pos) || null;
    }

    add(str: string): boolean {
        if (this.history.length > 0 && this.history[this.history.length - 1] == str) {
            this.pos = this.history.length;
            return false;
        }

        this.pos = this.history.push(str);
        return true;
    }
}

type ShellData = {
    state: ShellState;
    history: ShellHistory;
    cursorX: number;
    promptXOffset: number;

    promptBuffer: string;

    runningProc: Process | undefined;
};

function writePrompt(proc: Process<ShellData>) {
    proc.data.state = ShellState.PROMPT;

    let promptBuff = uint8_concat([
        new Uint8Array([ASCIICodes.CarriageReturn, ASCIICodes.NewLine,]),// New Line
        uint8_fromString("<"),
        CSI(ASCIICodes.Three, ASCIICodes.Three, ASCIICodes.m),
        uint8_fromString(proc.device.name),
        CSI(ASCIICodes.Zero, ASCIICodes.m),
        uint8_fromString(">"),
    ]);

    proc.data.promptXOffset = 2 + proc.device.name.length;
    proc.data.cursorX = proc.data.promptXOffset + 1;

    proc.term_write(promptBuff);
}

function replacePromptBuffer(proc: Process<ShellData>, text: string, cursorX?: number) {
    proc.data.promptBuffer = text;
    proc.data.cursorX = cursorX || proc.data.promptXOffset + proc.data.promptBuffer.length + 1;
    proc.term_write(uint8_concat([
        CSI(...uint8_fromString((proc.data.promptXOffset + 1).toString()), ASCIICodes.G), // move cursor to begin of prompt
        CSI(ASCIICodes.Zero, ASCIICodes.K), // Clear Line
        uint8_fromString(text), // write buffer to screen
        CSI(...uint8_fromString(proc.data.cursorX.toString()), ASCIICodes.G) // move cursor to new position
    ]))

}

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
    proc.term_write(CSI(...numbertonumbers(1), ASCIICodes.G, ...CSI(ASCIICodes.Two, ASCIICodes.K)))

    // display marker that there is more to the left
    if (options_start > 0) {
        proc.term_write(uint8_concat([
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
            proc.term_write(uint8_concat([
                CSI(ASCIICodes.Six + 1, ASCIICodes.m), // invert colours
                uint8_fromString(option),
                CSI(ASCIICodes.Zero, ASCIICodes.m), // reset
                CSI(ASCIICodes.C)
            ]));
        } else {
            proc.term_write(uint8_fromString(option + " "))
        }
    }

    if (options_end < options.length - 1) {
        // indicate that there is more to the right
        proc.term_write(uint8_concat([
            CSI(...numbertonumbers(MAX_OPTIONS_WIDTH + 1), ASCIICodes.G), // move the cursor
            CSI(ASCIICodes.Six + 1, ASCIICodes.m), // invert colours
            uint8_fromString(">"),
            CSI(ASCIICodes.Zero, ASCIICodes.m), // reset
        ])); /** the `TerminalRenderer` does not do the color properly at the moment */

    }

    proc.term_write(CSI(...numbertonumbers(cursorX + 1), ASCIICodes.G))
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
        let options = proc.device.programs.map(p => p.name);

        if (options.includes(proc.data)) {
            return ProcessSignal.EXIT;
        }

        let root = "";

        if (proc.data) {
            options = options.filter(n => n.startsWith(proc.data));
            if (options.length == 1) {
                proc.data = options[0];
                return ProcessSignal.EXIT;
            } else if (options.length == 0) {
                let [name] = proc.data.split(" ");
                let subp = proc.data.substring(name.length + 1);
                let program = proc.device.programs.find(p => p.name == name);
                while (program && program.sub && program.sub.length) {
                    options = program.sub.map(p => p.name)

                    if (subp) {
                        options = options.filter(n => n.startsWith(subp))
                    }

                    if (options.length === 0) {
                        root = root + name + " ";
                        [name] = subp.split(" ");
                        subp = subp.substring(name.length + 1);
                        program = program.sub.find(p => p.name == name);
                        continue
                    }

                    if (options.length == 1) {
                        proc.data = program.name + " " + options[0]
                        return ProcessSignal.EXIT;
                    } else {
                        root = root + name + " ";
                        break
                    }
                }
            }
        }

        if (options.length == 0) {
            return ProcessSignal.EXIT;
        }

        let term_width = 38;
        let selected_option_idx = 0;
        proc.term_write(new Uint8Array([ASCIICodes.NewLine]));

        proc.spawn(proc, DEVICE_PROGRAM_TERMQUERY, undefined, {}, (sproc) => {
            if (!sproc.data.width) return;
            term_width = sproc.data?.width;
            lazywriter_write_options(proc, options, selected_option_idx, term_width);
        });

        proc.term_read(proc, (_, bytes) => {
            let byte = bytes[0];

            if (byte === ASCIICodes.Space) {
                options[selected_option_idx] += " ";
            }

            if (
                byte === ASCIICodes.Space ||
                byte === ASCIICodes.NewLine ||
                byte === ASCIICodes.CarriageReturn
            ) {
                proc.data = root + options[selected_option_idx]
                // move cursor to start clear line and go up on line
                proc.term_write(CSI(...numbertonumbers(1), ASCIICodes.G, ...CSI(ASCIICodes.Two, ASCIICodes.K), ...CSI(ASCIICodes.A)));
                proc.close(proc, ProcessSignal.EXIT);
                return true;
            }

            if (
                byte === ASCIICodes.Escape && bytes.length === 1 ||
                byte === 3
            ) {
                proc.term_write(CSI(...numbertonumbers(1), ASCIICodes.G, ...CSI(ASCIICodes.Two, ASCIICodes.K), ...CSI(ASCIICodes.A)));
                proc.close(proc, ProcessSignal.EXIT);
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
        })

        return ProcessSignal.__EXPLICIT__;
    }
}

function read(proc: Process<ShellData>, bytes: Uint8Array) {
    if (proc.data.state === ShellState.UNITIALIZED) {
        return; // do nothing
    }

    if (proc.data.state === ShellState.PROMPT) {
        let i = 0; char_parse_loop: while (i < bytes.byteLength) {
            let byte = bytes[i];
            // handle writing characters to the screen
            if (byte >= ASCIICodes.Space && byte < ASCIICodes.Delete) {
                let char = String.fromCharCode(byte);
                if ((proc.data.cursorX - proc.data.promptXOffset - 1) < proc.data.promptBuffer.length) { // issues with non ascii-char
                    // special logic
                    let p = (proc.data.cursorX - proc.data.promptXOffset - 1);
                    replacePromptBuffer(
                        proc,
                        proc.data.promptBuffer.slice(0, p) + char + proc.data.promptBuffer.slice(p),
                        proc.data.cursorX + 1
                    )
                } else {
                    proc.data.promptBuffer += char
                    proc.term_write(new Uint8Array([byte]));
                    proc.data.cursorX += 1;
                }

                i++; continue char_parse_loop;
            }

            if (byte == ASCIICodes.Delete || byte == ASCIICodes.BackSpace) {
                if (proc.data.promptBuffer.length <= 0 || proc.data.cursorX <= proc.data.promptXOffset + 1) {
                    i++; continue char_parse_loop;
                }

                if ((proc.data.cursorX - proc.data.promptXOffset - 1) < proc.data.promptBuffer.length) {
                    let p = (proc.data.cursorX - proc.data.promptXOffset - 1);
                    replacePromptBuffer(proc,
                        proc.data.promptBuffer.slice(0, p - 1) + proc.data.promptBuffer.slice(p),
                        proc.data.cursorX - 1
                    )
                } else {
                    proc.data.promptBuffer = proc.data.promptBuffer.substring(0, proc.data.promptBuffer.length - 1);
                    proc.term_write(new Uint8Array([ASCIICodes.BackSpace]));
                    proc.data.cursorX -= 1;
                }

            } else if (byte == ASCIICodes.Tab) {
                console.log("[TAB] Pressed")
                proc.spawn(proc, lazywriter, undefined, proc.data.promptBuffer, (sproc) => {
                    if (sproc.data === undefined)
                        return;
                    replacePromptBuffer(proc, sproc.data)
                });

            } else if (byte == ASCIICodes.CarriageReturn || byte == ASCIICodes.NewLine) {
                console.log("[ENTER] Pressed")
                // do stuff

                let argv = parseArgs(proc.data.promptBuffer);
                let name = argv.shift();
                let program: Program | undefined = proc.device.programs.find(p => p.name == name);
                while (argv.length > 0 && program) {
                    name = argv.shift();
                    let tmp = program;
                    program = program?.sub?.find((p) => name == p.name)
                    if (!program) {
                        program = tmp;
                        break;
                    }
                }

                // TODO! read sub programs, this could maybe be something that isn't a shell thing

                proc.data.history.add(proc.data.promptBuffer);

                if (program) {
                    proc.term_write(new Uint8Array([ASCIICodes.NewLine]));
                    proc.data.state = ShellState.RUNNING_PROGRAM;

                    proc.data.runningProc = proc.spawn(proc, program, parseArgs(proc.data.promptBuffer), undefined, (_, status) => {
                        (<ShellData>proc.data).state = ShellState.RUNNING_PROGRAM;
                        (<ShellData>proc.data).promptBuffer = "";

                        // continue reading bytes from buf
                        if (bytes.byteLength > i + 1) {
                            read(proc, bytes.subarray(i));
                        }

                        delete (<ShellData>proc.data).runningProc;
                        writePrompt(proc);
                    });

                    break char_parse_loop;
                }

                proc.data.promptBuffer = "";
                writePrompt(proc);
            } else if (byte == ASCIICodes.Escape) {
                if (i == bytes.byteLength - 1) {// last byte 
                    i++;
                    continue char_parse_loop;
                }

                byte = bytes[++i];

                if (byte != ASCIICodes.OpenSquareBracket) {
                    continue char_parse_loop;
                }

                let rawParams: number[] = [];
                while (++i < bytes.byteLength) {
                    byte = bytes[i];

                    if (
                        byte >= 0x30 &&
                        byte <= 0x3f
                    ) {
                        rawParams.push(byte);
                    } else if (
                        byte >= 0x40 &&
                        byte <= 0x7E
                    ) {
                        rawParams.push(byte);
                        break;
                    }
                }

                if (rawParams.length == 0) {
                    continue char_parse_loop; // error
                }

                let finalByte = rawParams[rawParams.length - 1]; rawParams.pop();

                let interperetNavigationParams = (params: number[]): {
                    ctrl: boolean;
                    shift: boolean;
                } => {
                    params = readParams(rawParams, -1);
                    let lastN = params[params.length - 1];
                    return { ctrl: lastN >= 5, shift: lastN == 2 || lastN == 6 }
                }

                switch (finalByte) {
                    case ASCIICodes.A: { // ArrowUp
                        let previous = proc.data.history.previous();
                        if (previous != null) {
                            replacePromptBuffer(proc, previous)
                        }
                    }; break;
                    case ASCIICodes.B: { // ArrowDown
                        let next = proc.data.history.next();
                        if (next != null) {
                            replacePromptBuffer(proc, next)
                        }
                    }; break;
                    case ASCIICodes.C: { // ArrowRight
                        let { ctrl } = interperetNavigationParams(rawParams)

                        // move cursor to right
                        let isAtEnd = ((proc.data.cursorX - proc.data.promptXOffset) > proc.data.promptBuffer.length)
                        if (isAtEnd) {
                            break;
                        }

                        let step = 0;

                        if (!ctrl) {
                            // simple move
                            step = 1;
                        } else {
                            let x = proc.data.cursorX - proc.data.promptXOffset - 1; // due to cursor being 1-based

                            // find the position of the first char behind a whitespace

                            let char = proc.data.promptBuffer[x];
                            let prevc = char;

                            while (char && !(char != " " && prevc == " ")) {
                                step += 1;
                                prevc = char;
                                char = proc.data.promptBuffer[x + step];
                            }
                        }

                        if (step > 0) {
                            proc.data.cursorX += step;
                            proc.term_write(CSI(...uint8_fromString(step.toString()), ASCIICodes.C));
                        }

                    }; break;
                    case ASCIICodes.D: { // ArrowLeft
                        let { ctrl } = interperetNavigationParams(rawParams)

                        let isAtBegin = proc.data.cursorX <= (proc.data.promptXOffset + 1)
                        if (isAtBegin) {
                            break;
                        }
                        let step = 0;
                        // move cursor to left
                        if (!ctrl) {
                            // simple move
                            step = 1;
                        } else {
                            let x = proc.data.cursorX - proc.data.promptXOffset - 1; // due todsa dsa cursor being 1-based

                            let char = proc.data.promptBuffer[x - 1];
                            let prevc = char;

                            while (char && !(prevc != " " && char == " ") || char == prevc) {
                                step += 1;
                                prevc = char;
                                char = proc.data.promptBuffer[x - step];
                            }
                            step -= 1
                        }

                        if (step > 0) {
                            proc.data.cursorX -= step;
                            proc.term_write(CSI(...uint8_fromString(step.toString()), ASCIICodes.D));
                        }
                    }; break;
                    case ASCIICodes.F: { // End
                        // move cursor to end

                        // Note There is a problem due to the terminal renederer auto wrapping text and then the states diverge

                        proc.data.cursorX = proc.data.promptXOffset + proc.data.promptBuffer.length + 1;
                        proc.term_write(CSI(...uint8_fromString((
                            proc.data.cursorX
                        ).toString()), ASCIICodes.G));
                    }; break;
                    case ASCIICodes.H: { // Home
                        // move cursor to Begin
                        proc.data.cursorX = proc.data.promptXOffset + 1;
                        proc.term_write(CSI(...uint8_fromString((
                            proc.data.cursorX
                        ).toString()), ASCIICodes.G));
                    }; break;
                }
            } else if (byte == 3) {
                proc.data.promptBuffer = "";
                writePrompt(proc);
            }
            i++;
        }
    }

    if (proc.data.state === ShellState.RUNNING_PROGRAM) {
        /**
         * IMPORTANT PLS READ
         * The following logic is not thought through
         */

        if (!proc.data.runningProc) {
            throw new Error(DAEMON_SHELL.name + ": this.runningProc is undefined, ", proc.data.runningProc);
        }

        if (bytes.includes(3)) {
            proc.data.runningProc.close(proc.data.runningProc, ProcessSignal.INTERRUPT);
        }
    }

}

export const DAEMON_SHELL: Program = {
    name: "daemon_shell",
    init(proc, _) {
        // just because i know the internals, but this is not obvious
        (<ShellData>proc.data) = {
            state: ShellState.UNITIALIZED,
            history: new ShellHistory(),
            cursorX: 1,
            promptXOffset: 0,
            promptBuffer: "",
            runningProc: undefined
        };

        proc.term_read(proc, read)
        writePrompt(proc);

        return ProcessSignal.__EXPLICIT__;
    }
}