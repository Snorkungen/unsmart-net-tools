import { uint8_concat, uint8_fromString } from "../binary/uint8-array";
import type { Device } from "../device/device";
import { DPSignal, DeviceProgram, DeviceProgramSignal, DeviceProgramTerminal } from "../device/device-program";
import { ASCIICodes, CSI, readParams } from "./shared";

interface ShellTerminal {
    write(bytes: Uint8Array): void;
    flush(): void;
    read?(bytes: Uint8Array): void;
}

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

export default class Shell {
    private device: Device;
    private terminal?: ShellTerminal;

    private history = new ShellHistory();

    private state: ShellState = ShellState.UNITIALIZED;

    constructor(device: Device) {
        this.device = device;
    }

    configureTerminal(terminal: ShellTerminal) {
        this.terminal = terminal;
        this.terminal.read = this.read.bind(this);

        this.writePrompt();
    }

    configureDevice (device: Device) {
        if (this.state == ShellState.RUNNING_PROGRAM) {
            return;
        }

        this.device = device;
        this.writePrompt();
    }

    private runningProgramInformation?: {
        terminal: DeviceProgramTerminal;
        signal: DeviceProgramSignal;
        program: DeviceProgram;
    }

    // Writing information that needs to be kept track off
    private cursorX: number = 1; // keeps track of wher cursor is 1-based 
    private promptXOffset = 0;

    private promptBuffer: string = "";

    private replacePromptBuffer(text: string, cursorX = this.promptXOffset + this.promptBuffer.length + 1) {
        if (!this.terminal) {
            return;
        }

        // clear the line and change'

        this.promptBuffer = text;
        this.cursorX = cursorX;
        this.terminal.write(uint8_concat([
            CSI(...uint8_fromString((this.promptXOffset + 1).toString()), ASCIICodes.G), // move cursor to begin of prompt
            CSI(ASCIICodes.Zero, ASCIICodes.K), // Clear Line
            uint8_fromString(text), // write buffer to screen
            CSI(...uint8_fromString(this.cursorX.toString()), ASCIICodes.G) // move cursor to new position
        ]));
    }
    private writePrompt() {
        if (!this.terminal) {
            return;
        }

        this.state = ShellState.PROMPT;
        let promptBuff = uint8_concat([
            new Uint8Array([ASCIICodes.CarriageReturn, ASCIICodes.NewLine,]),// New Line
            uint8_fromString("<"),
            CSI(ASCIICodes.Three, ASCIICodes.Three, ASCIICodes.m),
            uint8_fromString(this.device.name),
            CSI(ASCIICodes.Zero, ASCIICodes.m),
            uint8_fromString(">"),
        ])

        // set the x position of the cursor
        this.promptXOffset = 2 + this.device.name.length;
        this.cursorX = this.promptXOffset + 1;

        this.terminal.write(promptBuff)

    }

    read(bytes: Uint8Array) {
        if (!this.terminal) {
            return; // should probably throw an error as this should not be called if there is no attached terminal
        }

        switch (this.state) {
            case ShellState.UNITIALIZED: return; // do nothing
            case ShellState.PROMPT: {
                let i = 0; char_parse_loop: while (i < bytes.byteLength) {
                    let byte = bytes[i];

                    // handle writing characters to the screen
                    if (byte >= ASCIICodes.Space && byte < ASCIICodes.Delete) {
                        let char = String.fromCharCode(byte);
                        if ((this.cursorX - this.promptXOffset - 1) < this.promptBuffer.length) { // issues with non ascii-char
                            // special logic
                            let p = (this.cursorX - this.promptXOffset - 1);
                            this.replacePromptBuffer(
                                this.promptBuffer.slice(0, p) + char + this.promptBuffer.slice(p),
                                this.cursorX + 1
                            )
                        } else {
                            this.promptBuffer += char
                            this.terminal.write(new Uint8Array([byte]));
                            this.cursorX += 1;
                        }

                        i++; continue char_parse_loop;
                    }

                    if (byte == ASCIICodes.Delete || byte == ASCIICodes.BackSpace) {
                        if (this.promptBuffer.length <= 0 || this.cursorX <= this.promptXOffset + 1) {
                            i++; continue char_parse_loop;
                        }

                        if ((this.cursorX - this.promptXOffset - 1) < this.promptBuffer.length) {
                            let p = (this.cursorX - this.promptXOffset - 1);
                            this.replacePromptBuffer(
                                this.promptBuffer.slice(0, p - 1) + this.promptBuffer.slice(p),
                                this.cursorX - 1
                            )
                        } else {
                            this.promptBuffer = this.promptBuffer.substring(0, this.promptBuffer.length - 1);
                            this.terminal.write(new Uint8Array([ASCIICodes.BackSpace]));
                            this.cursorX -= 1;
                        }

                    } else if (byte == ASCIICodes.Tab) {
                        console.log("[TAB] Pressed")
                    } else if (byte == ASCIICodes.CarriageReturn || byte == ASCIICodes.NewLine) {
                        console.log("[ENTER] Pressed")
                        // do stuff

                        // i'm just testing this is not that simple due to the many ways i could solve this
                        let [name] = this.promptBuffer.split(" ");

                        let program = this.device.programs.find((dp) => dp.name == name);

                        // TODO! read sub programs, this could maybe be something that isn't a shell thing

                        if (program) {
                            this.terminal.write(new Uint8Array([ASCIICodes.NewLine]));
                            this.state = ShellState.RUNNING_PROGRAM;

                            let signal = new DeviceProgramSignal();
                            let terminal: DeviceProgramTerminal = {
                                write: this.terminal.write.bind(this.terminal),
                                flush: this.terminal.flush.bind(this.terminal),
                            }

                            this.runningProgramInformation = {
                                signal,
                                terminal,
                                program
                            }

                            program.run(this.promptBuffer, {
                                terminal: terminal,
                                device: this.device,
                                signal: signal
                            })
                                .then(() => { // Instead of DevicePrograms being a promise it should instead rely upon the DeviceProgramSignal.
                                    this.state = ShellState.PROMPT;
                                    this.history.add(this.promptBuffer);
                                    this.promptBuffer = "";

                                    // retake ownership of terminal
                                    this.configureTerminal(this.terminal!)

                                    // continue reading bytes from buf
                                    if (bytes.byteLength > i + 1) {
                                        this.read.bind(this)(bytes.subarray(i))
                                    }

                                    // teardown running program
                                    terminal.write = () => null;
                                    terminal.flush = () => null;
                                    delete this.runningProgramInformation;

                                });

                            break char_parse_loop;
                        }

                        // for now just to get stuff happening on the screen
                        this.promptBuffer = "";
                        this.writePrompt();
                    } else if (byte == ASCIICodes.Escape) {
                        if (i == bytes.byteLength - 1) {// last byte 
                            continue char_parse_loop;
                        }
                        byte = bytes[++i]

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
                                let previous = this.history.previous();
                                if (previous != null) {
                                    this.replacePromptBuffer(previous)
                                }
                            }; break;
                            case ASCIICodes.B: { // ArrowDown
                                let next = this.history.next();
                                if (next != null) {
                                    this.replacePromptBuffer(next)
                                }
                            }; break;
                            case ASCIICodes.C: { // ArrowRight
                                let { ctrl } = interperetNavigationParams(rawParams)

                                // move cursor to right
                                let isAtEnd = ((this.cursorX - this.promptXOffset) > this.promptBuffer.length)
                                if (isAtEnd) {
                                    break;
                                }

                                let step = 0;

                                if (!ctrl) {
                                    // simple move
                                    step = 1;
                                } else {
                                    let x = this.cursorX - this.promptXOffset - 1; // due to cursor being 1-based

                                    // find the position of the first char behind a whitespace

                                    let char = this.promptBuffer[x];
                                    let prevc = char;

                                    while (char && !(char != " " && prevc == " ")) {
                                        step += 1;
                                        prevc = char;
                                        char = this.promptBuffer[x + step];
                                    }
                                }

                                if (step > 0) {
                                    this.cursorX += step;
                                    this.terminal.write(CSI(...uint8_fromString(step.toString()), ASCIICodes.C));
                                }

                            }; break;
                            case ASCIICodes.D: { // ArrowLeft
                                let { ctrl } = interperetNavigationParams(rawParams)

                                let isAtBegin = this.cursorX <= (this.promptXOffset + 1)
                                if (isAtBegin) {
                                    break;
                                }
                                let step = 0;
                                // move cursor to left
                                if (!ctrl) {
                                    // simple move
                                    step = 1;
                                } else {
                                    let x = this.cursorX - this.promptXOffset - 1; // due todsa dsa cursor being 1-based

                                    let char = this.promptBuffer[x - 1];
                                    let prevc = char;

                                    while (char && !(prevc != " " && char == " ") || char == prevc) {
                                        step += 1;
                                        prevc = char;
                                        char = this.promptBuffer[x - step];
                                    }
                                    step -= 1
                                }

                                if (step > 0) {
                                    this.cursorX -= step;
                                    this.terminal.write(CSI(...uint8_fromString(step.toString()), ASCIICodes.D));
                                }
                            }; break;
                            case ASCIICodes.F: { // End
                                // move cursor to end

                                // Note There is a problem due to the terminal renederer auto wrapping text and then the states diverge

                                this.cursorX = this.promptXOffset + this.promptBuffer.length + 1;
                                this.terminal.write(CSI(...uint8_fromString((
                                    this.cursorX
                                ).toString()), ASCIICodes.G));
                            }; break;
                            case ASCIICodes.H: { // Home
                                // move cursor to Begin
                                this.cursorX = this.promptXOffset + 1;
                                this.terminal.write(CSI(...uint8_fromString((
                                    this.cursorX
                                ).toString()), ASCIICodes.G));
                            }; break;
                        }
                    }


                    i++;
                }; break;

            }
            case ShellState.RUNNING_PROGRAM: {
                /**
                 * IMPORTANT PLS READ
                 * The following logic is not thought through
                 */

                if (!this.runningProgramInformation) {
                    throw new Error(Shell.name + ": this.runningProgramInformation is undefined, ", this.runningProgramInformation);
                }

                let t = this.runningProgramInformation.terminal;
                if (t.read) {
                    // just forward everything do not care
                    t.read(bytes);
                } else {
                    // check for Ctrl+C
                    if (bytes.includes(3)) {
                        this.runningProgramInformation.signal.send(DPSignal.TERMINATE)

                        // in future add logic for terminating programs
                    }

                }
            }; break;
            default: break;
        }

    }
}