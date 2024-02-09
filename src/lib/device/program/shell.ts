import { uint8_concat, uint8_fromString } from "../../binary/uint8-array";
import { ASCIICodes, CSI, readParams } from "../../terminal/shared";
import { Process, ProcessSignal, Program } from "../device";
import { parseArgs } from "./helpers";

enum ShellState {
    UNITIALIZED,
    PROMPT,
    RUNNING_PROGRAM,
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