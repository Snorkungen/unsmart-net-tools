
export enum ASCIICodes {
    NUL = 0,
    BackSpace = 0x08,
    Tab = 0x09,
    NewLine = 0x0A,
    CarriageReturn = 0x0D,
    Escape = 0x1B,
    Semicolon = 0x3B,
    OpenSquareBracket = 0x5B,


    Zero = 0x30, // 48
    A = 0x41, // 65
    a = 0x61, // 97
    m = 0x6D, // 109
}


export default class Terminal {




}

type TerminalRendererCursor = {
    x: number;
    y: number;
}

export class TerminalRenderer {
    // options start
    COLUMN_WIDTH = 8 * 8;
    ROW_HEIGHT = 6 * 8;


    COLORS = [
        "#000000",
        "#b21818",
        "#18b218",
        "#b26818",
        "#1818b2",
        "#b218b2",
        "#18b2b2",
        "#b2b2b2"
    ]
    COLOR_BG_DEFAULT = 0 % this.COLORS.length;
    COLOR_BG = this.COLOR_BG_DEFAULT;
    COLOR_FG_DEFAULT = 7 % this.COLORS.length;
    COLOR_FG = this.COLOR_FG_DEFAULT;

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
            row.style.padding = "0";
            row.style.margin = "0";
            row.style.lineHeight = "normal";
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

    private handleEraseDisplay(p: number) {
        const clear_from_cursor_to_end = () => {
            // clear from cursor to end of screen

            // loop thru rows
            for (let row of this.container.children) {
                for (let x = this.cursor.x; x < row.children.length; x++) {
                    row.children[x].innerHTML = this.EMPTY_CHAR;
                    (row.children[x] as HTMLElement).style.backgroundColor = this.color(this.COLOR_BG);
                    (row.children[x] as HTMLElement).style.color = this.color(this.COLOR_FG);
                }
            }
        }
        const clear_from_cursor_to_start = () => {
            // clear from cursor to end of screen

            // loop thru rows
            for (let row of this.container.children) {
                for (let x = this.cursor.x; x >= 0; x--) {
                    row.children[x].innerHTML = this.EMPTY_CHAR;
                    (row.children[x] as HTMLElement).style.backgroundColor = this.color(this.COLOR_BG);
                    (row.children[x] as HTMLElement).style.color = this.color(this.COLOR_FG);
                }
            }
        }

        if (p == 0) clear_from_cursor_to_end();
        else if (p == 1) clear_from_cursor_to_start();
        else if (p == 2) {
            // clear entire screen
            this.cursor.x = 0
            this.cursor.y = 0
            clear_from_cursor_to_end()
        }
    }
    private handleSelectGraphicRendition (n: number) {
        if (n == 0) {
            // reset all attributes
            this.COLOR_BG = this.COLOR_BG_DEFAULT;
            this.COLOR_FG = this.COLOR_FG_DEFAULT;
        } 

        // only support colors for now

        if (n == 7) {
            // invert colors
            let tmp = this.COLOR_BG;
            this.COLOR_BG = this.COLOR_FG;
            this.COLOR_FG = tmp;
        }

        if (n >= 30 && n <= 37) {
            // set foreground color
            this.COLOR_FG = n - 30;
        }

        if (n >= 40 && n <= 47) {
            // set background color
            this.COLOR_BG = n - 40;
        }

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
                    let params = readParams(rawParams, 1,1)

                    this.cursor.y = Math.max(
                        this.cursor.y - params[0],
                        0
                    )

                    break;
                }
                case ASCIICodes.A + 1: { // B
                    // handle Cursor down
                    let params = readParams(rawParams, 1,1)
                    this.cursor.y += params[0];
                    break;
                }
                case ASCIICodes.A + 2: { // C
                    // handle Cursor forward
                    let params = readParams(rawParams, 1,1)

                    this.cursor.x = Math.min(this.cursor.x + params[0], this.COLUMN_WIDTH)
                    break;
                }
                case ASCIICodes.A + 3: { // D
                    // handle Cursor Back
                    let params = readParams(rawParams, 1,1)

                    this.cursor.x = Math.max(this.cursor.x - params[0], 0)
                    break;
                }
                case ASCIICodes.A + 4: { // E
                    // handle Cursor Next Line
                    let params = readParams(rawParams, 1,1)

                    this.cursor.y += params[0];
                    this.cursor.x = 0;
                    break;
                }
                case ASCIICodes.A + 5: { // F
                    // handle Cursor Previous Line
                    let params = readParams(rawParams, 1,1)

                    this.cursor.y = Math.max(
                        this.cursor.y - params[0],
                        0
                    )
                    this.cursor.x = 0;
                    break;
                }
                case ASCIICodes.A + 6: { // G
                    // handle Cursor Horizontal Absolute
                    let params = readParams(rawParams, 1,1)

                    // I think this is  1-based
                    if (params[0]) {
                        params[0] -= 1
                    }

                    this.cursor.x = Math.min(
                        params[0],
                        this.COLUMN_WIDTH
                    )

                    break;
                }
                case ASCIICodes.A + 7: case ASCIICodes.a + 5: { // H f
                    // handle set Cursor position
                    let params = readParams(rawParams, 1, 2);

                    let [row, col] = params;
                    // ESC [ <y> ; <x> H <https://github.com/0x5c/VT100-Examples/blob/master/vt_seq.md#simple-cursor-positioning>
                    row = Math.max(row - 1, 0);
                    col = Math.max(col - 1, 0); // 1-based

                    this.cursor.x = Math.min(col, this.COLUMN_WIDTH);
                    this.cursor.y = row;

                    break;
                }
                case ASCIICodes.A + 9: { // J
                    let [n] = readParams(rawParams, 2, 1);
                    this.handleEraseDisplay(n)
                    break;
                }
                
                case ASCIICodes.m: {
                    // Select Graphic Rendition
                    let [n] = readParams(rawParams, 0);
                    this.handleSelectGraphicRendition(n);
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
            activeElement.style.backgroundColor = this.color(this.COLOR_BG);
            activeElement.style.color = this.color(this.COLOR_FG);

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

function readParams(params: number[], fallback: number, minLength?: number): number[] {
    if (params.length == 0) {

        return (new Array<number>(minLength || 1)).fill(fallback)
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

    if (minLength && result.length < minLength) {
        // fill to the minimu length
        let diff = minLength - result.length;

        result.push(...(new Array(diff)).fill(fallback))
    }

    return result;
}
