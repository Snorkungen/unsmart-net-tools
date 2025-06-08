import { ASCIICodes, CSI, numbertonumbers } from "../../terminal/shared";
import { DeviceIO, Process, ProcessSignal, Program } from "../device";
import { ioprint, ioprintln } from "./helpers";
import { termquery } from "./termquery";


type MenuFields = {
    [id: number]: {
        description: string;
        cb(proc: Process): Promise<void>;
    };
}

function menu_read_line(io: DeviceIO, bytes?: Uint8Array): Promise<Uint8Array> {
    let xdiff = 0;
    const buffer: number[] = [];

    // !TODO: integrate this with the shell to and add more cursor movement features ...
    return new Promise(resolve => {
        let reader = io.reader_add(bytes => {
            for (let i = 0; i < bytes.byteLength; i++) {
                let byte = bytes[i];

                // handle backspace
                if (byte == ASCIICodes.Delete || byte == ASCIICodes.BackSpace) {
                    if (xdiff == 0 || buffer.length == 0) {
                        continue;
                    }

                    buffer.pop();
                    xdiff -= 1;

                    io.write(new Uint8Array([ASCIICodes.BackSpace]))
                } else if (byte == ASCIICodes.CarriageReturn || byte == ASCIICodes.NewLine) {
                    io.reader_remove(reader);
                    resolve(new Uint8Array(buffer));

                    if (i < (bytes.byteLength - 1)) {
                        throw new Error("more bytes in the pipline")
                    }
                } else if (byte >= ASCIICodes.Space && byte < ASCIICodes.Delete) {
                    io.write(new Uint8Array([byte]));
                    buffer.push(byte);
                    xdiff += 1;
                }
            }
        });

        if (bytes) {
            reader(bytes);
        }
    })
}

async function run_menu(proc: Process, fields: MenuFields): Promise<ProcessSignal.__EXPLICIT__> {
    let tq = await termquery(proc);
    if (!tq.ch || !tq.cv) {
        throw new Error("program does not work without original cursor position")
    }

    let og_ch = tq.ch;
    let og_cv = tq.cv;

    let bytes: undefined | Uint8Array = undefined;

    while (!proc.abort_controller.signal.aborted) {
        // reset view
        proc.io.write(CSI(...numbertonumbers(og_cv), ASCIICodes.Semicolon, ...numbertonumbers(og_ch), ASCIICodes.H)); // move cursor position to original spot
        proc.io.write(CSI(ASCIICodes.Zero, ASCIICodes.J));// clear cursor to the end

        // print menu
        for (let [key, val] of Object.entries(fields)) {
            ioprintln(proc.io, `(${key})\t${val.description}`);
        }
        ioprint(proc.io, "select an option: ");

        // wait for input
        bytes = await menu_read_line(proc.io, bytes);


        let key = parseInt(String.fromCharCode(...bytes));
        // execute selected program
        let field = fields[key];

        if (!field) {
            continue
        }
        bytes = undefined
        
        proc.io.write(CSI(...numbertonumbers(og_cv), ASCIICodes.Semicolon, ...numbertonumbers(og_ch), ASCIICodes.H)); // move cursor position to original spot
        proc.io.write(CSI(ASCIICodes.Zero, ASCIICodes.J));// clear cursor to the end

        await field.cb(proc);
    }

    return ProcessSignal.__EXPLICIT__
}

export const DEVICE_PROGRAM_MENU: Program = {
    name: "menu",
    init(proc, args, data) {
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
    let bytes = await menu_read_line(proc.io);
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
    await menu_read_line(proc.io);
    return;
}