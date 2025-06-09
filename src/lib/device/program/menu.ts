import { ASCIICodes, CSI, numbertonumbers } from "../../terminal/shared";
import { Process, ProcessSignal, Program } from "../device";
import { ioprint, ioprintln, ioreadline } from "./helpers";
import { termquery } from "./termquery";

export type MenuFields = {
    [id: number]: {
        description: string;
        cb(proc: Process, /** call this to quite the run menu loop  */resolve: () => void): Promise<void>;
    };
}

export async function run_menu(proc: Process, fields: MenuFields, initial_op?: number): Promise<ProcessSignal.ERROR> {
    let tq = await termquery(proc);
    if (!tq.ch || !tq.cv) {
        throw new Error("program does not work without original cursor position")
    }

    let og_ch = tq.ch;
    let og_cv = tq.cv;

    let bytes: undefined | Uint8Array = undefined;

    let keep_running = true;
    function resolve() {
        keep_running = false;
    }

    if (initial_op && !isNaN(initial_op)) {
        let field = fields[initial_op];
        if (field) {
            proc.io.write(CSI(...numbertonumbers(og_cv), ASCIICodes.Semicolon, ...numbertonumbers(og_ch), ASCIICodes.H)); // move cursor position to original spot
            proc.io.write(CSI(ASCIICodes.Zero, ASCIICodes.J));// clear cursor to the end
            await field.cb(proc, resolve);
        }
    }

    while (!proc.abort_controller.signal.aborted && keep_running) {
        // reset view
        proc.io.write(CSI(...numbertonumbers(og_cv), ASCIICodes.Semicolon, ...numbertonumbers(og_ch), ASCIICodes.H)); // move cursor position to original spot
        proc.io.write(CSI(ASCIICodes.Zero, ASCIICodes.J));// clear cursor to the end

        // print menu
        for (let [key, val] of Object.entries(fields)) {
            ioprintln(proc.io, `(${key})\t${val.description}`);
        }
        ioprint(proc.io, "select an option: ");

        // wait for input
        bytes = (await ioreadline(proc.io, { intial_bytes: bytes }))[0];

        let key = parseInt(String.fromCharCode(...bytes));
        // execute selected program
        let field = fields[key];

        if (!field) {
            continue
        }
        bytes = undefined

        proc.io.write(CSI(...numbertonumbers(og_cv), ASCIICodes.Semicolon, ...numbertonumbers(og_ch), ASCIICodes.H)); // move cursor position to original spot
        proc.io.write(CSI(ASCIICodes.Zero, ASCIICodes.J));// clear cursor to the end

        await field.cb(proc, resolve);
    }

    return ProcessSignal.ERROR
}

export const DEVICE_PROGRAM_MENU: Program = {
    name: "menu",
    init(proc) {
        return run_menu(proc, {
            [0]: {
                description: "quit menu",
                async cb(proc) {
                    ioprintln(proc.io, "Bye!")
                    proc.close();
                }
            },
            [1]: {
                description: "count",
                cb: menu_prog_example,
            }
        });
    },
    __NODATA__: true,
}

async function menu_prog_example(proc: Process) {
    ioprint(proc.io, "How high shall I count? ");
    let [bytes] = await ioreadline(proc.io);
    proc.io.write(new Uint8Array([10])); // new line
    let n = parseInt(String.fromCharCode(...bytes))
    n = Math.abs(n);
    if (!isNaN(n)) {
        // print numbers
        for (let i = 1; i <= n; i++) {
            ioprintln(proc.io, i.toString())
        }
    }

    ioprint(proc.io, "press enter to return to menu ... ");
    await ioreadline(proc.io);
    return;
}