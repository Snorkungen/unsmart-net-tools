import { uint8_concat, uint8_fromString } from "../binary/uint8-array";
import type { Device } from "../device/device";
import { DPSignal, DeviceProgram, DeviceProgramSignal, DeviceProgramTerminal } from "../device/device-program";
import { ASCIICodes, CSI } from "./shared";

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
        if (this.pos <= -1) {
            return null;
        }

        return this.history.at(this.pos--) || null;
    }

    next(): string | null {
        console.log(this.pos)
        if (this.pos >= this.history.length - 1) {
            return null;
        }

        return this.history.at(this.pos++) || null;
    }

    add(str: string): boolean {
        if (this.history.length > 0 && this.history[this.history.length - 1] == str) {
            return false;
        }

        this.pos = this.history.push(str) - 1;
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

    private runningProgramInformation?: {
        terminal: DeviceProgramTerminal;
        signal: DeviceProgramSignal;
        program: DeviceProgram;
    }

    // Writing information that needs to be kept track off
    private cursorX: number = 1; // keeps track of wher cursor is 1-based 

    private promptBuffer: string = "";

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
        this.cursorX = 2 + this.device.name.length;

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
                        // append byte to prompt buffer
                        this.promptBuffer += String.fromCharCode(byte);
                        this.cursorX += 1;
                        this.terminal.write(new Uint8Array([byte]));

                        i++; continue char_parse_loop;
                    }

                    if (byte == ASCIICodes.Delete || byte == ASCIICodes.BackSpace) {
                        if (this.promptBuffer.length <= 0) {
                            i++; continue char_parse_loop;
                        }
                        this.promptBuffer = this.promptBuffer.substring(0, this.promptBuffer.length - 1);

                        this.terminal.write(new Uint8Array([ASCIICodes.BackSpace]));
                        this.cursorX -= 1;
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
                                });

                            break char_parse_loop;
                        }

                        // for now just to get stuff happening on the screen
                        this.promptBuffer = "";
                        this.writePrompt();
                    }

                    // handle Tab & Enter & Backspace

                    // Escaped bytes

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