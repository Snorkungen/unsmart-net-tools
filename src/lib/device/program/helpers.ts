import { uint8_concat, uint8_fromString } from "../../binary/uint8-array";
import { CSI, ASCIICodes, TERMINAL_DEFAULT_COLUMNS, readParams, numbertonumbers } from "../../terminal/shared";
import { DeviceIO, Process, Program } from "../device";

export const TAB_SIZE = 8;

export const tabAlign = (n: number) => n + TAB_SIZE - (n % TAB_SIZE);

export function chunkString(
    str: string,
    chunkSize: number,
    minChunkSize: number = 12
): string[] {
    let chunks: string[] = new Array(Math.ceil(str.length / chunkSize));
    let ci = 0;

    // smarter chunking
    while (str.length > 0) {
        let chunkEnd = Math.min(str.length - 1, chunkSize);

        if (str.length - 1 < chunkSize) {
            chunks[ci++] = str;
            break;
        }

        // looks for the first space
        while (chunkEnd > minChunkSize) {
            if (str[chunkEnd] == " ") {
                break;
            }
            chunkEnd--;
        }

        if (minChunkSize == chunkEnd) {
            chunkEnd = chunkSize
            str = str.substring(0, chunkEnd) + " " + str.substring(chunkEnd)
        }

        chunks[ci++] = str.substring(0, chunkEnd);
        str = str.substring(1 + chunkEnd); // disappear a space char
    }
    return chunks;
}

/** source <https://stackoverflow.com/a/44646838> */
export function getLengthOfLongestElement(arr: { length: number }[]) {
    return Math.max(0, ...arr.map(s => s?.length || 0));
}

export function formatTable(table: (string | undefined)[][], columns = TERMINAL_DEFAULT_COLUMNS): Uint8Array {
    let lengths: number[] = []

    for (let i = 0; i < getLengthOfLongestElement(table); i++) {
        lengths[i] = getLengthOfLongestElement(
            table.map(r => r[i] || "")
        );
    }

    let buf: Uint8Array[] = [];
    const itoa = (n: number) => uint8_fromString((n).toString())

    lengths = lengths.map((v) => tabAlign(v));
    let colSizes = lengths.slice()

    // figure out the colSizes
    let sum = colSizes.reduce((s, v) => s + v, 0);
    if (sum > columns) {
        // do some logic
        let li = 0, largest = colSizes[li];
        for (let ll = li + 1; ll < colSizes.length; ll++) {
            if (colSizes[ll] > largest) {
                li = ll;
                largest = colSizes[ll];
            }
        }

        // this is simple
        lengths[li] = colSizes[li] - (sum - columns);
        colSizes[li] = lengths[li] - 3;
    }

    for (let row of table) {
        let newlines = 0;
        for (let i = 0; i < row.length; i++) {
            if (!row[i]) {
                continue;
            }

            if (newlines > 0) {
                // move cursor up n amount
                buf.push(
                    CSI(...itoa(newlines), ASCIICodes.A)
                )
            }

            let leftOffset = 0;
            for (let j = 0; j < i; j++) {
                leftOffset += lengths[j]
            }

            let padBuf = CSI(...itoa(leftOffset), ASCIICodes.G)

            if (leftOffset > 0) {
                buf.push(
                    padBuf
                )
            }

            let content = row[i]!;

            if (content.length < colSizes[i]) {
                buf.push(
                    uint8_fromString(row[i]!)
                )
            } else {
                let chunks = chunkString(content, colSizes[i]);
                // first chunk is already aligned
                for (let ci = 0; ci < chunks.length - 1; ci++) {
                    buf.push(uint8_fromString(chunks[ci] + "\n"), padBuf)
                }
                buf.push(uint8_fromString(chunks[chunks.length - 1])); // last chunk

                let tmp = chunks.length - 1;

                // if last row elem no new newlines
                // if last
                if (i + 1 == row.length) {
                    if (newlines > tmp) {
                        newlines = newlines - tmp;
                    } else {
                        newlines = 0;
                    }
                } else {
                    newlines = Math.max(newlines, tmp);
                }
            }
        }

        buf.push(new Uint8Array(new Array(newlines + 1).fill(ASCIICodes.NewLine)))
    }

    return uint8_concat(buf);
}

export function spawn_program_promisify<T extends any>(proc: Process, program: Program<T>, args?: string[], data?: Partial<T> | undefined,): Promise<T> {
    return new Promise((resolve) => proc.spawn(program, args, data, {
        on_close(sproc) {
            resolve(sproc.data)
        }
    }));
}

export function ioprint(io: DeviceIO, text: string) {
    return io.write(uint8_fromString(text));
}
export function ioprintln(io: DeviceIO, text: string) {
    return io.write(uint8_fromString(text + "\n"));
}
export function ioclearline(io: DeviceIO) {
    io.write(CSI(ASCIICodes.Zero, ASCIICodes.G)) // move cursor to begin of line
    io.write(CSI(ASCIICodes.Zero, ASCIICodes.K))// Clear Line)
}

let interpret_nav_params = (raw_params: number[],): { ctrl: boolean, shift: boolean } => {
    let params = readParams(raw_params, -1);
    let last = params[params.length - 1];
    return { ctrl: last >= 5, shift: last == 2 || last == 6 };
}
export async function ioreadline(io: DeviceIO, options: Partial<{
    intial_bytes: Uint8Array;
    targets: number[][];
}> = {}): Promise<[bytes: Uint8Array, trigger: Uint8Array]> {
    let x_max = 0;
    let x_cursor = 0;
    const buffer: number[] = [];

    if (!options.targets) {
        options.targets = [[ASCIICodes.NewLine], [ASCIICodes.CarriageReturn]]
    } else {
        options.targets.push([ASCIICodes.NewLine], [ASCIICodes.CarriageReturn])
    }

    return new Promise(resolve => {
        let reader = io.reader_add(bytes => {
            for (let i = 0; i < bytes.byteLength; i++) {
                let byte = bytes[i];
                if /* handle character input*/ (byte >= ASCIICodes.Space && byte < ASCIICodes.Delete) {
                    if (x_cursor < x_max) {
                        buffer.splice(x_cursor, 0, byte);
                        io.write(CSI(ASCIICodes.Zero, ASCIICodes.K)); // clear in line from cursor to end
                        io.write(new Uint8Array(buffer.slice(x_cursor))); // write bytes left
                        io.write(CSI(...numbertonumbers((buffer.length - x_cursor) - 1), ASCIICodes.D))
                    } else {
                        buffer.push(byte);
                        io.write(new Uint8Array([byte]));
                    }

                    x_cursor += 1;
                    x_max = Math.max(x_cursor, x_max + 1 /* account for the new character */);
                } /* handle backspace */ else if (byte == ASCIICodes.Delete || byte == ASCIICodes.BackSpace) {
                    if (x_cursor == 0 || buffer.length == 0) {
                        continue;
                    }

                    if (x_cursor < x_max) {
                        // replace the entire thing and modify the buffer
                        x_cursor -= 1;
                        x_max = Math.max(x_cursor, x_max - 1 /* account for remove character */);

                        // remove char at x_cursor
                        buffer.splice(x_cursor, 1)

                        io.write(CSI(ASCIICodes.One, ASCIICodes.D)) // move cursor back by one
                        io.write(new Uint8Array(buffer.slice(x_cursor))); // write bytes left
                        io.write(CSI(ASCIICodes.Zero, ASCIICodes.K)); // clear in line from cursor to end
                        io.write(CSI(...numbertonumbers(buffer.length - x_cursor /* bytes written */), ASCIICodes.D))
                    } else {
                        x_cursor -= 1;
                        x_max = Math.max(x_cursor, x_max - 1 /* account for remove character */);
                        buffer.pop();
                        io.write(new Uint8Array([ASCIICodes.BackSpace]))
                    }

                } /* handle escape */ else if (byte == ASCIICodes.Escape) {
                    if (i == (bytes.byteLength - 1) || bytes[i + 1] != ASCIICodes.OpenSquareBracket) {

                        if (options.targets!.find(v => v.length == 1 && v[0] == ASCIICodes.Escape)) {
                            io.reader_remove(reader);
                            resolve([new Uint8Array(buffer), bytes.slice(i, i + 1)]);

                            if (i < (bytes.byteLength - 1)) {
                                throw new Error("more bytes in the pipline")
                            }
                            return;
                        }

                        i++;
                        continue; // ignore last byte
                    }

                    let trigger_start = i;
                    i += 1;

                    // consume the rest of the parameters
                    let raw_params: number[] = [];
                    inner_loop: while (++i < bytes.byteLength) {
                        byte = bytes[i];

                        if (byte >= 0x30 && byte <= 0x3f) {
                            raw_params.push(byte);
                        } else if (byte >= 0x40 && byte <= 0x7E) {
                            raw_params.push(byte);
                            break inner_loop;
                        }
                    }

                    if (raw_params.length == 0) {
                        i = trigger_start + 2; // this could cause issues
                        continue; // ignore this this was weird
                    }

                    let fbyte = raw_params.pop();
                    switch (fbyte) { // Handle navigation
                        case ASCIICodes.C: { // ArrowRight
                            let { ctrl } = interpret_nav_params(raw_params);
                            // move cursor to the right
                            let is_at_end = x_cursor == x_max;
                            if (is_at_end || x_cursor >= (buffer.length)) { // can't move continue
                                break; // leave switch statement
                            }

                            let step = 0;
                            if (!ctrl) {
                                step = 1; // simple move
                            } else {
                                let char = buffer[x_cursor];
                                let prev_char = char;

                                while (char && !(char != ASCIICodes.Space && prev_char == ASCIICodes.Space)) {
                                    step += 1;
                                    prev_char = char;
                                    char = buffer[x_cursor + step]
                                }
                            }
                            if (step > 0) {
                                x_cursor += step;
                                io.write(CSI(...numbertonumbers(step), ASCIICodes.C)); // move cursor
                            }
                        }; break;
                        case ASCIICodes.D: { // ArrowLeft
                            let { ctrl } = interpret_nav_params(raw_params);
                            let is_at_begin = x_cursor == 0;
                            if (is_at_begin) {
                                break; // leave switch statement
                            }

                            let step = 0;
                            if (!ctrl) {
                                step = 1;
                            } else {
                                let char = buffer[x_cursor - 1];
                                let prev_char = char;

                                while (char && !(prev_char != ASCIICodes.Space && char == ASCIICodes.Space) || char == prev_char) {
                                    step += 1;
                                    prev_char = char;
                                    char = buffer[x_cursor - step];
                                }
                                step -= 1;
                            }

                            if (step > 0) {
                                x_cursor -= step;
                                io.write(CSI(...numbertonumbers(step), ASCIICodes.D)); // move cursor
                            }
                        }; break;
                        case ASCIICodes.F: { // End 
                            // !NOTE: when wrapping this no longer manages to keep track of things
                            io.write(CSI(...numbertonumbers(x_max - x_cursor), ASCIICodes.C)); // move cursor to the end
                            x_cursor = x_max;
                        }; break;
                        case ASCIICodes.H: { // Home
                            // !NOTE: when wrapping this no longer manages to keep track of things
                            io.write(CSI(...numbertonumbers(x_cursor), ASCIICodes.D)); // move cursor to the end
                            x_cursor = 0;
                        }
                    }

                    if (options.targets!.find(v => v.length >= 3 && v[0] == ASCIICodes.Escape && v[1] == ASCIICodes.OpenSquareBracket && v.at(-1)! == fbyte)) {
                        io.reader_remove(reader);
                        resolve([new Uint8Array(buffer), bytes.slice(trigger_start, i + 1)]);

                        if (i < (bytes.byteLength - 1)) {
                            throw new Error("more bytes in the pipline")
                        }
                    }
                } else if (options.targets!.find(v => v.includes(byte))) /* Check that byte is a target */ {
                    io.reader_remove(reader);
                    resolve([new Uint8Array(buffer), bytes.slice(i, i + 1)]);

                    if (i < (bytes.byteLength - 1)) {
                        throw new Error("more bytes in the pipline")
                    }
                    return;
                }
            }
        });

        if (options.intial_bytes) {
            reader(options.intial_bytes);
            io.flush()
        }
    });
}