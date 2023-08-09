import { Device } from "../device/device";
import { TTYWriter, TTYProgram, parseArgs, TTYPrograms, TTYProgramInitializer, resolveTTYProgram } from "./program";

class TTYStateWriter implements TTYWriter {
    stateManager: TTYStateManager;

    constructor(stateManager: TTYStateManager) {
        this.stateManager = stateManager;
    }

    get elem(): HTMLTextAreaElement {
        return this.stateManager.elem;
    }

    write(text: string): void {
        let p = this.elem.selectionEnd;
        this.elem.textContent =
            this.elem.textContent!.slice(0, p) + text + this.elem.textContent!.slice(p)
        this.elem.selectionEnd = p + text.length;
        this.elem.selectionStart = this.elem.selectionEnd;

        this.elem.scrollTop = this.elem.scrollHeight;
    }
    clear(): void {
        this.elem.textContent = "tty cleared!"
    }
    clearLine(): void {
        this.elem.textContent = this.elem.textContent!.substring(0, this.stateManager.textLength - this.stateManager.args.length)
    }
}
class TTYLazyWriter {
    stateManager: TTYStateManager;

    constructor(stateManager: TTYStateManager) {
        this.stateManager = stateManager;
    }

    get programs() {
        return this.stateManager.programs;
    }
    get args() {
        return this.stateManager.args;
    }

    dirty = true;
    prevArgs?: string;
    private options: Array<string> = [];
    private optionIndex: number = -1;

    private getSuitableOptions(args: string, name: string, program: TTYProgram, options: string[] = [], depth = 0): typeof options {
        if (args.length <= name.length) {
            for (let i = 0; i < args.length; i++) {
                if (args[i] != name[i]) {
                    return options;
                }
            }
            return [name];
        }
        let argv = parseArgs(args).slice(depth);

        if (argv[0] != parseArgs(name).at(-1)) {
            return options;
        }

        if (!program.sub) {
            return options;
        }


        for (let key in program.sub) {
            options.push(...this.getSuitableOptions(args, `${name} ${key}`, program.sub[key], [], depth + 1))
        }

        return options;
    }

    private calculateOptions() {
        this.options = [];

        let args = this.prevArgs;

        if (this.dirty) {
            args = this.args
        }

        this.prevArgs = this.stateManager.args;

        if (typeof args != "string") return;

        for (let key in this.programs) {
            let options = this.getSuitableOptions(args, key, this.programs[key]);
            this.options.push(...options)
        }

        if (this.options.length == 0) {
            this.optionIndex = -1;
        } else {
            this.optionIndex = 0;
        }
    }

    next(): string | null {
        if (this.dirty) {
            this.calculateOptions()
        }

        if (this.optionIndex < 0) return null;

        let res = this.options[this.optionIndex];

        if (this.optionIndex < this.options.length - 1) {
            this.optionIndex++;
        } else {
            this.optionIndex = 0;
        }

        return res;
    }
}

class TTYStateHistory {
    private entries: string[] = [];
    private pos: number = -1;

    add(entry: string) {
        this.entries.unshift(entry);
        this.pos = -1;
    }

    getUp(): string | null {
        if (
            this.entries.length == 0 ||
            this.pos >= this.entries.length
        ) {
            return null;
        }

        this.pos += 1;
        if (this.pos == this.entries.length) {
            this.pos -= 1;
        }

        return this.entries[this.pos] || null;
    }

    getDown(): string | null {
        if (
            this.entries.length == 0 ||
            this.pos <= 0
        ) {
            return null;
        }

        this.pos -= 1;
        return this.entries[this.pos] || null;
    }
}
export class TTYStateManager {
    elem: HTMLTextAreaElement;
    device: Device;
    programs: TTYPrograms;

    writer: TTYStateWriter;
    lazyWriter: TTYLazyWriter;
    history: TTYStateHistory = new TTYStateHistory();

    constructor(elem: HTMLTextAreaElement, device: Device, programs: TTYPrograms) {
        this.elem = elem;
        this.device = device;
        this.programs = programs;

        this.writer = new TTYStateWriter(this);
        this.lazyWriter = new TTYLazyWriter(this);
    }

    get prompt(): string {
        return `<${this.device.name}>`;
    }

    get textLength(): number {
        if (!this.elem.textContent) return 0;
        return this.elem.textContent.length;
    }

    get row(): string {
        if (!this.elem.textContent) return "";
        return this.elem.textContent.split("\n").at(-1) || ""
    }
    get args(): string {
        if (!this.elem.textContent) return "";
        return this.row.substring(this.prompt.length);
    }

    get rowStart(): number {
        return this.textLength - this.row.length;
    }
    get argStart(): number {
        return this.rowStart + this.prompt.length;
    }

    runningProgram?: ReturnType<TTYProgramInitializer>;

    onKeyDown(e: KeyboardEvent) {
        e.preventDefault();
        if (e.ctrlKey && e.key == "c") {
            this.runningProgram && this.runningProgram.cancel()
        }

        if (e.key == "Tab") {
            let res = this.lazyWriter.next();
            if (res) {
                this.writer.clearLine();
                this.writer.write(res);
                this.lazyWriter.dirty = false;
            }
        } else {
            this.lazyWriter.dirty = true;
        }
        switch (e.key) {
            case "Backspace":
                if (this.elem.selectionEnd <= this.argStart) break;
                let deleteCount = 1, p = this.elem.selectionEnd - deleteCount
                this.elem.textContent =
                    this.elem.textContent!.slice(0, p) + this.elem.textContent!.slice(this.elem.selectionEnd)

                this.elem.selectionEnd = p;
                this.elem.selectionStart = this.elem.selectionEnd;
                break;
            case "ArrowUp":
                let getUpRes = this.history.getUp();
                if (getUpRes) {
                    this.writer.clearLine();
                    this.writer.write(getUpRes)
                }
                break;
            case "ArrowDown":
                let getDownRes = this.history.getDown();
                if (getDownRes) {
                    this.writer.clearLine();
                    this.writer.write(getDownRes)
                }
                break;
            case "ArrowLeft":
                let lk: "selectionStart" | "selectionEnd" = "selectionEnd"
                if (e.shiftKey) {
                    lk = "selectionStart"
                }

                let lamount = 1;

                // if ctrl go to begin of word
                if (e.ctrlKey) for (let i = (this.elem[lk] - 1); i > this.argStart; i--) {
                    if ((this.elem[lk] - 1) != i && this.elem.textContent![i] == " ") {
                        lamount--
                        break;
                    }

                    lamount += 1;
                }

                if (this.elem[lk] <= this.argStart) break;
                this.elem[lk] -= lamount
                break;
            case "ArrowRight":
                let ramount = 1;
                // if ctrl go to end of word
                if (e.ctrlKey) for (let i = this.elem.selectionEnd + 1; i < this.textLength; i++) {
                    if (this.elem.textContent![i] == " ") {
                        break;
                    }
                    ramount += 1;
                }

                this.elem.selectionEnd += ramount;

                if (!e.shiftKey) {
                    this.elem.selectionStart = this.elem.selectionEnd;
                }
                break;
            case "Enter":
                let args = this.args;
                this.history.add(args);

                // set cursor to end
                this.elem.selectionEnd = this.textLength;
                this.elem.selectionStart = this.elem.selectionEnd;

                this.writer.write("\n")
                let [key] = parseArgs(args),
                    entry = resolveTTYProgram(this.programs[key], args);

                if (!entry) {
                    this.writer.write(this.prompt);
                    break;
                }


                let prog = entry(this.writer, this.device, this.programs);

                this.runningProgram = prog;

                (async () => {
                    try {
                        await prog.run(args)
                    } catch (error) {
                        console.error(e);
                    } finally {
                        this.writer.write("\n" + this.prompt)
                        this.runningProgram = undefined;
                    }
                })();
                break;

            default:
                if (e.key.length > 1) break;
                this.writer.write(e.key)
        }

    }
}
