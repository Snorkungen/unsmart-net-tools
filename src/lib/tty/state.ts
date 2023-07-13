import { Device } from "../device/device";
import { TTYWriter, TTYProgram, parseArgs, TTYPrograms, TTYProgramInitializer, resolveTTYProgram } from "./program";

class TTYStateWriter implements TTYWriter {
    stateManager: TTYStateManager;

    constructor(stateManager: TTYStateManager) {
        this.stateManager = stateManager;
    }

    get elem(): HTMLElement {
        return this.stateManager.elem;
    }

    write(text: string): void {
        this.elem.textContent += text
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
    elem: HTMLElement;
    device: Device;
    programs: TTYPrograms;

    writer: TTYStateWriter;
    lazyWriter: TTYLazyWriter;
    history: TTYStateHistory = new TTYStateHistory();

    constructor(elem: HTMLElement, device: Device, programs: TTYPrograms) {
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

    runningProgram?: ReturnType<TTYProgramInitializer>;

    // TEMPORARY
    entries: string[] = []; entryIndex = 0;

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
                if (this.elem.textContent!.split("\n").at(-1) == this.prompt) break;
                this.elem.textContent = this.elem.textContent!.substring(0, this.elem.textContent!.length - 1)
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

            case "Enter":
                let args = this.args;
                this.history.add(args);

                this.writer.write("\n")
                let [key] = parseArgs(args),
                    entry = resolveTTYProgram(this.programs[key], args);

                if (!entry) {
                    this.writer.write(this.prompt);
                    break;
                }


                let prog = entry(this.writer, this.device, this.programs);

                this.runningProgram = prog;

                prog.run(args)
                    .then(_ => this.writer.write("\n" + this.prompt))
                    .catch(e => { console.error(e); this.writer.write("\n" + this.prompt) })

                break;

            default:
                if (e.key.length > 1) break;
                this.writer.write(e.key)
        }

    }
}
