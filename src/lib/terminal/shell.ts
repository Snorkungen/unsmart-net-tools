import { uint8_concat, uint8_fromString } from "../binary/uint8-array";
import { Device } from "../device/device";
import { ASCIICodes, CSI } from "./shared";

interface ShellTerminal {
    write(bytes: Uint8Array): void;
    read?(bytes: Uint8Array): void;
}

enum ShellState {
    UNITIALIZED,
    PROMPT,
    RUNNING_PROGRAM,
}

export default class Shell {
    private device: Device;
    private terminal?: ShellTerminal;

    private state: ShellState = ShellState.UNITIALIZED;

    constructor(device: Device) {
        this.device = device;
    }

    configureTerminal(terminal: ShellTerminal) {
        this.terminal = terminal;
        this.terminal.read = this.read.bind(this);

        this.writePrompt();
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

    private read(bytes: Uint8Array) {
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

                        
                        // for now just to get stuff happening on the screen
                        this.promptBuffer = "";
                        this.writePrompt();
                    }

                    // handle Tab & Enter & Backspace

                    // Escaped bytes

                    i++;
                }

            }
            default: break;
        }

    }
}