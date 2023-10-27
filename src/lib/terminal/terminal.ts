
export enum ASCIICodes {
    NUL = 0,
    BackSpace = 0x08,
    Tab = 0x09,
    NewLine = 0x0D,
    CarriageReturn = 0x0D,
    Escape = 0x1B,
    Semicolon = 0x3B,
    OpenSquareBracket = 0x5B,


    A = 0x41, // 65
    Zero = 0x30, // 48
}


export default class Terminal {




}

type TerminalRendererCursor = {
    x: number;
    y: number;
}

export class TerminalRenderer {
    // options start
    COLUMN_WIDTH = 4 * 8;
    ROW_HEIGHT = 6 * 8;


    COLORS = [
        "#080808",
        "#ffffff"
    ]
    COLOR_BG = 0 % this.COLORS.length;
    COLOR_FG = 1 % this.COLORS.length;

    EMPTY_CHAR = "&nbsp;"
    // options end

    container: HTMLElement;

    constructor(container: HTMLElement) {
        this.container = container;

        this.container.style.fontFamily = "monospace";
        // this.container.style.backgroundColor = this.color(this.COLOR_BG);

        // fill container with rows
        for (let i = 0; i < this.ROW_HEIGHT; i++) {
            let row = document.createElement("div")
            row.style.backgroundColor = this.color(this.COLOR_BG);
            for (let j = 0; j < this.COLUMN_WIDTH; j++) {
                let p = document.createElement("span")
                p.innerHTML = this.EMPTY_CHAR
                row.append(p)
            }
            this.container.append(row)
        }
    }

    buffer: Uint8Array = new Uint8Array();

    private prevCursor: TerminalRendererCursor = {
        x: 0,
        y: 0
    }
    private cursor: TerminalRendererCursor = {
        x: 0,
        y: 0
    }

    private handleEscapeSequences(i: number): number {
        let byte = this.buffer[i];
        if (byte == ASCIICodes.OpenSquareBracket) {
            // for now only handle cursor movement
            let rawParams: number[] = [];
            while (++i < this.buffer.byteLength) {
                byte = this.buffer[i];
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
                } else {
                    return -1; // Something unexpected happened
                }
            }

            if (rawParams.length == 0) {
                return -1; // error
            }

            let finalByte = rawParams[rawParams.length - 1]; rawParams.pop();

            switch (finalByte) {
                case ASCIICodes.A: {
                    // handle Cursor up
                    let params = readParams(rawParams, 1)
                    if (params.length < 1) {
                        return -1;
                    }

                    this.cursor.y = Math.max(
                        this.cursor.y - params[0],
                        0
                    )

                    break;
                }
                case ASCIICodes.A + 1: { // B
                    // handle Cursor down
                    let params = readParams(rawParams, 1)
                    if (params.length < 1) {
                        return -1;
                    }
                    this.cursor.y += params[0];
                    break;
                }
                case ASCIICodes.A + 2: { // C
                    // handle Cursor forward
                    let params = readParams(rawParams, 1)
                    if (params.length < 1) {
                        return -1;
                    }
                    this.cursor.x = Math.min(this.cursor.x + params[0], this.COLUMN_WIDTH)
                    break;
                }
                case ASCIICodes.A + 3: { // D
                    // handle Cursor Back
                    let params = readParams(rawParams, 1)
                    if (params.length < 1) {
                        return -1;
                    }

                    this.cursor.x = Math.max(this.cursor.x - params[0], 0)
                    break;
                }
                case ASCIICodes.A + 4: { // E
                    // handle Cursor Next Line
                    let params = readParams(rawParams, 1)
                    if (params.length < 1) {
                        return -1;
                    }
                    this.cursor.y += params[0];
                    this.cursor.x = 0;
                    break;
                }
                case ASCIICodes.A + 5: { // F
                    // handle Cursor Previous Line
                    let params = readParams(rawParams, 1)
                    if (params.length < 1) {
                        return -1;
                    }

                    this.cursor.y = Math.max(
                        this.cursor.y - params[0],
                        0
                    )
                    this.cursor.x = 0;
                    break;
                }
                case ASCIICodes.A + 6: { // G
                    // handle Cursor Horizontal Absolute
                    let params = readParams(rawParams, 1)
                    if (params.length < 1) {
                        return -1;
                    }

                    this.cursor.x = Math.min(
                        params[0],
                        this.COLUMN_WIDTH
                    )

                    break;
                }

                default: return -1; // unhandled control sequence
            }

            return i;
        }

        return -1
    }

    render() {
        if (!this.container) {
            throw new Error("container missing can't render")
        }

        let i = 0;
        char_parse_loop: while (i < this.buffer.byteLength) {
            let byte = this.buffer[i];

            // INSPIRATION <https://en.wikipedia.org/wiki/ANSI_escape_code>
            switch (byte) {
                case ASCIICodes.NUL: i++; continue char_parse_loop;
                case ASCIICodes.BackSpace: {
                    // handle backspace
                    this.cursor.x -= 1

                    if (this.cursor.x < 0) {
                        this.cursor.x = 0;
                        this.cursor.y -= 1;
                        if (this.cursor.y < 0) {
                            this.cursor.y = 0;
                            break;
                        }
                    }

                    let activeElement = this.container.children[this.cursor.y].children[this.cursor.x] as HTMLElement;
                    activeElement.innerHTML = this.EMPTY_CHAR
                    break;
                }
                case ASCIICodes.Tab: {
                    // handle Tab
                    this.cursor.x += 8 - this.cursor.x % 8;
                    if (this.cursor.x >= this.COLUMN_WIDTH) {
                        this.cursor.x = 0;
                        this.cursor.y += 1;
                    }
                    break;
                } case ASCIICodes.NewLine: {
                    // handle new line
                    this.cursor.x = 0;
                    this.cursor.y += 1
                    break;
                }
                case ASCIICodes.CarriageReturn: {
                    // handle carriage return
                    this.cursor.x = 0;
                    break;
                }
                case ASCIICodes.Escape: {
                    // move on to next byte
                    // increment index
                    i += 1; if (i > this.buffer.byteLength) {
                        return;
                    }

                    let tmp = i;
                    i = this.handleEscapeSequences(i);
                    if (i < 0) {
                        // something failed continue
                        i = tmp;
                        continue char_parse_loop;
                    }

                    break
                }
            }

            // only support ascii characters
            if (
                byte < 32 ||
                byte > 126
            ) {
                i++; continue char_parse_loop;
            }

            // draw character and move cursor position
            let activeElement = this.container.children[this.cursor.y].children[this.cursor.x] as HTMLElement;

            activeElement.textContent = String.fromCharCode(byte)

            // advance cursor
            this.cursor.x += 1;
            if (this.cursor.x >= this.COLUMN_WIDTH) {
                this.cursor.y += 1;
                this.cursor.x = 0;
            }

            i++; continue char_parse_loop;
        }

        // clear previous cursor
        let cursorElement = this.container.children[this.prevCursor.y].children[this.prevCursor.x] as HTMLElement;
        cursorElement.style.backgroundColor = this.color(this.COLOR_BG)
        cursorElement.style.color = this.color(this.COLOR_FG)

        // draw current cursor
        cursorElement = this.container.children[this.cursor.y].children[this.cursor.x] as HTMLElement;
        cursorElement.style.backgroundColor = this.color(this.COLOR_FG)
        cursorElement.style.color = this.color(this.COLOR_BG)
        this.prevCursor.x = this.cursor.x;
        this.prevCursor.y = this.cursor.y;

        // empty buffer 
        this.buffer = new Uint8Array();
    }

    private color(n: number) {
        return this.COLORS[n % this.COLORS.length];
    }
}

function readParams(params: number[], fallback: number): number[] {
    if (params.length == 0) {
        return [fallback]
    }

    let result: number[] = [], numBuffer: number[] = [];
    let j = 0;

    let consumeNumBuffer = () => {
        // consumeNumBuffer implementation taken from <https://www.geeksforgeeks.org/c-program-to-write-your-own-atoi/>
        let n = 0;
        for (let k = 0; k < numBuffer.length; k++) {
            n = n * 10 + numBuffer[k] - ASCIICodes.Zero
        }

        numBuffer = [];
        return n
    }
    while (j < params.length) {
        let pb = params[j]
        if (pb == ASCIICodes.Semicolon) {
            // read number buffer
            if (numBuffer.length == 0) {
                result.push(fallback)
            } else {
                result.push(consumeNumBuffer())
            }
            j++;
            continue;
        }

        if (pb >= ASCIICodes.Zero && pb < ASCIICodes.Zero + 10) {
            numBuffer.push(pb)
        }

        j++;
    }

    if (numBuffer.length > 0) {
        result.push(consumeNumBuffer())
    }
    return result;
}
