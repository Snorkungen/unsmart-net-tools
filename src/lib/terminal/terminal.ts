import { uint8_concat } from "../binary/uint8-array";
import { ASCIICodes, CSI, readParams } from "./shared";
export default class Terminal {
    private renderer: TerminalRenderer;
    private container: HTMLElement;

    constructor(container: HTMLElement) {
        this.container = container;
        this.renderer = new TerminalRenderer(container);

        this.container.tabIndex = 0;

        this.container.addEventListener("click", (event) => {
            (event.currentTarget instanceof HTMLElement) && event.currentTarget.focus()
        })

        this.container.addEventListener("keydown", (event) => {
            if (!this.read) {
                return; // no reader attached
            }

            // What i want to do is to support 7-bit ASCII

            let key = event.key;
            let buffer: Uint8Array | undefined;

            let CSI_NAVIGATION = (id: ASCIICodes) => (event.ctrlKey && event.shiftKey) ? (
                CSI(ASCIICodes.One, ASCIICodes.Semicolon, ASCIICodes.Six, id)
            ) : event.shiftKey ? (
                CSI(ASCIICodes.One, ASCIICodes.Semicolon, ASCIICodes.Two, id)
            ) : event.ctrlKey ? (
                CSI(ASCIICodes.One, ASCIICodes.Semicolon, ASCIICodes.Five, id)
            ) : CSI(id)

            let CSI_TILDE = (p: ASCIICodes) => (event.ctrlKey && event.shiftKey) ? (
                CSI(p, ASCIICodes.Semicolon, ASCIICodes.Six, ASCIICodes.Tilde)
            ) : event.shiftKey ? (
                CSI(p, ASCIICodes.Semicolon, ASCIICodes.Two, ASCIICodes.Tilde)
            ) : event.ctrlKey ? (
                CSI(p, ASCIICodes.Semicolon, ASCIICodes.Five, ASCIICodes.Tilde)
            ) : CSI(ASCIICodes.Tilde)

            // not the best way but i don't know if the key code from the browser API is reliable
            // Source : <https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_key_values>
            // Source 2 : <https://www.man7.org/linux/man-pages/man4/console_codes.4.html>
            switch (key) {
                // White space
                case "Enter": buffer = new Uint8Array([ASCIICodes.CarriageReturn]); break;
                case "Tab": buffer = event.shiftKey ? (
                    CSI(ASCIICodes.Z)
                ) : new Uint8Array([ASCIICodes.Tab]); break;

                // Navigation
                case "ArrowUp": buffer = CSI_NAVIGATION(ASCIICodes.A); break;
                case "ArrowDown": buffer = CSI_NAVIGATION(ASCIICodes.B); break;
                case "ArrowRight": buffer = CSI_NAVIGATION(ASCIICodes.C); break;
                case "ArrowLeft": buffer = CSI_NAVIGATION(ASCIICodes.D); break;
                case "End": buffer = CSI_NAVIGATION(ASCIICodes.F); break;
                case "Home": buffer = CSI_NAVIGATION(ASCIICodes.H); break;

                case "PageUp": buffer = CSI_TILDE(ASCIICodes.Five); break;
                case "PageDown": buffer = CSI_TILDE(ASCIICodes.Six); break;

                case "Insert": buffer = CSI_TILDE(ASCIICodes.Two); break;
                case "Delete": buffer = CSI_TILDE(ASCIICodes.Three); break;

                case "Backspace": buffer = event.ctrlKey ? (
                    new Uint8Array([ASCIICodes.BackSpace])
                ) : new Uint8Array([ASCIICodes.Delete]); break;

                case "Escape": buffer = new Uint8Array([ASCIICodes.Escape]); break;

                default: {
                    if (key.length > 1) {
                        return;
                    }

                    let code = key.charCodeAt(0);
                    if (code > 0x7f) {
                        return;
                    }

                    if (event.ctrlKey) {
                        let c = code;

                        if (c >= ASCIICodes.a && c <= ASCIICodes.z) {
                            c -= 32;
                        }

                        if (c >= ASCIICodes.A && c <= ASCIICodes.Underscore) {
                            code = c - (ASCIICodes.A - 1) // 64 
                        }

                        if (code == ASCIICodes.Space) {
                            code = 0;
                        }
                    }

                    buffer = new Uint8Array([code])
                }
            }

            if (buffer == undefined) {
                return;
            }

            this.read(buffer);

            // PREVENT Something unexpected
            event.preventDefault();
            event.stopPropagation()
        })

        this.container.addEventListener("focus", () => {
            console.log("focused")
            this.container.style.border = "blue 2px solid"; // in future change cursor style
        })
        this.container.addEventListener("blur", () => {
            console.log("focused")
            this.container.style.border = "none"; // in future change cursor style
        })

        // render to screen ?
        // const render = () => {
        //     this.renderer.render.bind(this.renderer)();
        //     requestAnimationFrame(render)
        // }
        // window.requestAnimationFrame(render);
    }

    read?: (bytes: Uint8Array) => void;

    // this is a temporary implementation
    write(bytes: Uint8Array) {
        // this is the issue
        this.renderer.buffer = uint8_concat([this.renderer.buffer, bytes]); // this copies to much theres no need for ram
        this.renderer.render();
    }

    flush() {
        this.renderer.render();
    }
}

type TerminalRendererCursor = {
    x: number;
    y: number;
}

type TerminalRendererCell = {
    content?: string;

    fg: number;
    bg: number;

    // space for future
}
export class TerminalRenderer {
    // options start
    COLUMN_WIDTH = 80;
    ROW_HEIGHT = 2 * 8;

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
    EMPTY_CELL = {
        fg: this.COLOR_FG,
        bg: this.COLOR_BG,
    };
    // options end

    private rows: TerminalRendererCell[][];
    private yOffset: number = 0;

    container: HTMLElement;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;


    private cell_dimensions(): [width: number, height: number] {
        this.ctx.textBaseline = "top"
        this.ctx.font = "1em monospace";
        let mt = this.ctx.measureText("X")

        return [Math.ceil(mt.width), Math.ceil(mt.fontBoundingBoxDescent)]
    }

    constructor(container: HTMLElement, canvas?: HTMLCanvasElement) {
        this.container = container;
        this.container.style.fontFamily = "monospace";


        this.canvas = document.createElement("canvas")
        this.container.parentElement?.append(this.canvas)
        this.ctx = this.canvas.getContext("2d")!;
        this.canvas.style.marginTop = "2px"

        this.ctx.textBaseline = "top"
        this.ctx.font = "1em monospace";

        this.canvas.width = this.COLUMN_WIDTH * 10; // !TODO: dynamically set the witdth of the canvas
        this.canvas.height = this.ROW_HEIGHT * 18; // thees values are hardcoded

        window.setTimeout(() => {
            let [width, height] = this.cell_dimensions();
            console.log(width, height)
        }, 1)

        this.ctx.fillStyle = "black"
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.container.style.backgroundColor = this.color(this.COLOR_BG);

        // init rows
        this.rows = new Array<TerminalRendererCell[]>(this.ROW_HEIGHT);

        // fill container with rows
        for (let i = 0; i < this.ROW_HEIGHT; i++) {
            // duplicate state
            this.rows[i] = new Array<TerminalRendererCell>(this.COLUMN_WIDTH);

            let row = document.createElement("div")
            row.style.padding = "0";
            row.style.margin = "0";
            row.style.lineHeight = "normal";
            row.style.backgroundColor = this.color(this.COLOR_BG);
            for (let j = 0; j < this.COLUMN_WIDTH; j++) {
                let p = document.createElement("span")
                p.innerHTML = this.EMPTY_CHAR
                row.append(p)

                // duplicate state
                this.rows[i][j] = {
                    ...this.EMPTY_CELL
                }
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

    private _eraseCell(x: number, y: number) {
        let [width, height] = this.cell_dimensions();
        this.ctx.fillStyle = this.color(this.COLOR_BG);
        this.ctx.fillRect(x * width, (y - this.yOffset) * height, width, height);

        this.handleScroll();
        if (y - this.yOffset < 0) return;

        let cell = this.container.children[y - this.yOffset].children[x];
        cell.innerHTML = this.EMPTY_CHAR;
        (cell as HTMLElement).style.backgroundColor = this.color(this.COLOR_BG);
        (cell as HTMLElement).style.color = this.color(this.COLOR_FG);

        if (this.rows[y] && this.rows[y][x]) this.rows[y][x] = {
            fg: this.COLOR_FG, bg: this.COLOR_BG
        }
    }

    // NOTE THIS FUNCTION BELOW NEEDS TO BE REWORKED DUE "SCROLLING"
    private handleEraseDisplay(p: number) {
        const clear_from_cursor_to_end = () => {
            // clear from cursor to end of screen

            // loop thru rows
            // truncate rows not in view
            let posInView = this.cursor.y - this.yOffset;
            let rowsAfterView = this.rows.length - (this.cursor.y + (this.ROW_HEIGHT - 1) + posInView) - 1
            for (let i = 1; i <= rowsAfterView; i++) {
                this.rows.pop()
            }

            let rowsInViewToBeErased = (this.ROW_HEIGHT - 1) - posInView;

            for (let y = this.cursor.y; y <= this.cursor.y + rowsInViewToBeErased; y++) {
                for (let x = 0; x < this.COLUMN_WIDTH; x++) {
                    this._eraseCell(x, y);
                }
            }
        }
        const clear_from_cursor_to_start = () => {
            let posInView = this.cursor.y - this.yOffset;
            let rowsBeforeView = this.cursor.y - posInView;
            for (let i = 0; i < rowsBeforeView; i++) {
                this.rows.shift()
            }

            this.prevCursor.y -= (rowsBeforeView);
            this.cursor.y = posInView;
            this.yOffset = 0;

            for (let y = this.cursor.y; y >= 0; y--) {
                for (let x = 0; x < this.COLUMN_WIDTH; x++) {
                    this._eraseCell(x, y);
                }
            }
        }

        if (p == 0) clear_from_cursor_to_end();
        else if (p == 1) clear_from_cursor_to_start();
        else if (p == 2) {
            // clear entire screen
            this.cursor.x = 0
            this.cursor.y = 0
            this.handleScroll()
            clear_from_cursor_to_end()
        }
    }
    private handleEraseInLine(p: number) {
        if (p == 0) {
            // clear from cursor to end
            for (let x = this.cursor.x; x < this.COLUMN_WIDTH; x++) {
                this._eraseCell(x, this.cursor.y);
            }
        }
        else if (p == 1) {
            // clear from cursor to start
            for (let x = this.cursor.x; x >= 0; x--) {
                this._eraseCell(x, this.cursor.y);
            }
        }
        else if (p == 2) {
            // clear entire screen
            for (let x = 0; x < this.COLUMN_WIDTH; x++) {
                this._eraseCell(x, this.cursor.y);
            }
        }
    }
    private handleSelectGraphicRendition(n: number) {
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
                    let params = readParams(rawParams, 1, 1)

                    this.cursor.y = Math.max(
                        this.cursor.y - params[0],
                        0
                    )
                }; break;
                case ASCIICodes.A + 1: { // B
                    // handle Cursor down
                    let params = readParams(rawParams, 1, 1)
                    this.cursor.y += params[0];
                }; break;
                case ASCIICodes.A + 2: { // C
                    // handle Cursor forward
                    let params = readParams(rawParams, 1, 1)

                    this.cursor.x = Math.min(this.cursor.x + params[0], this.COLUMN_WIDTH)
                }; break;
                case ASCIICodes.A + 3: { // D
                    // handle Cursor Back
                    let params = readParams(rawParams, 1, 1)

                    this.cursor.x = Math.max(this.cursor.x - params[0], 0)
                }; break;
                case ASCIICodes.A + 4: { // E
                    // handle Cursor Next Line
                    let params = readParams(rawParams, 1, 1)

                    this.cursor.y += params[0];
                    this.cursor.x = 0;
                }; break;
                case ASCIICodes.A + 5: { // F
                    // handle Cursor Previous Line
                    let params = readParams(rawParams, 1, 1)

                    this.cursor.y = Math.max(
                        this.cursor.y - params[0],
                        0
                    )
                    this.cursor.x = 0;
                }; break;
                case ASCIICodes.A + 6: { // G
                    // handle Cursor Horizontal Absolute
                    let params = readParams(rawParams, 1, 1)

                    // I think this is  1-based
                    if (params[0]) {
                        params[0] -= 1
                    }

                    this.cursor.x = Math.min(
                        params[0],
                        this.COLUMN_WIDTH
                    )

                }; break;
                case ASCIICodes.A + 7: case ASCIICodes.a + 5: { // H f
                    // handle set Cursor position
                    let params = readParams(rawParams, 1, 2);

                    let [row, col] = params;
                    // ESC [ <y> ; <x> H <https://github.com/0x5c/VT100-Examples/blob/master/vt_seq.md#simple-cursor-positioning>
                    row = Math.max(row - 1, 0);
                    col = Math.max(col - 1, 0); // 1-based

                    this.cursor.x = Math.min(col, this.COLUMN_WIDTH);
                    this.cursor.y = row;
                }; break;
                case ASCIICodes.A + 9: { // J
                    let [n] = readParams(rawParams, 2, 1);
                    this.handleEraseDisplay(n)
                    break;
                }
                case ASCIICodes.A + 10: { // K
                    // erase in line
                    let [n] = readParams(rawParams, 2, 1);
                    this.handleEraseInLine(n)
                }; break;

                case ASCIICodes.S: { // S
                    // Scroll Up
                    let [n] = readParams(rawParams, 1, 1);
                    if (n <= 0) break;

                    this.cursor.y = Math.max(
                        (Math.floor(this.cursor.y / this.ROW_HEIGHT) - n),
                        0
                    ) * this.ROW_HEIGHT;

                }; break;
                case ASCIICodes.S + 1: { // T
                    // Scroll Down
                    let [n] = readParams(rawParams, 1, 1);


                    let tmp = this.ROW_HEIGHT - 1;
                    this.cursor.y = (Math.floor(this.cursor.y / this.ROW_HEIGHT) + n) * this.ROW_HEIGHT + tmp;

                    // this is hacky
                    // add the required rows to make it padded
                    this.handleScroll();
                    this.cursor.y -= tmp;
                }; break;

                case ASCIICodes.m: {
                    // Select Graphic Rendition
                    let [n] = readParams(rawParams, 0);
                    this.handleSelectGraphicRendition(n);
                }; break;

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
                        this.cursor.x = this.COLUMN_WIDTH - 1;
                        this.cursor.y -= 1;
                        if (this.cursor.y < 0) {
                            this.cursor.y = 0;
                            this.cursor.x = 0;
                            break;
                        }
                    }

                    this._eraseCell(this.cursor.x, this.cursor.y);
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

            this.handleScroll();

            // draw character and move cursor position
            let activeElement = this.container.children[this.cursor.y - this.yOffset].children[this.cursor.x] as HTMLElement;

            let cy = this.cursor.y - this.yOffset, cx = this.cursor.x;
            let [width, height] = this.cell_dimensions();

            // draw background first
            this.ctx.fillStyle = this.color(this.COLOR_BG);
            this.ctx.fillRect(cx * width, cy * height, width, height)

            this.ctx.fillStyle = this.color(this.COLOR_FG)
            this.ctx.fillText(String.fromCharCode(byte), cx * width, cy * height)

            // hacky fix
            if (byte == ASCIICodes.Space) {
                activeElement.innerHTML = "&nbsp"
            } else {
                activeElement.innerHTML = String.fromCharCode(byte);
            }

            activeElement.style.backgroundColor = this.color(this.COLOR_BG);
            activeElement.style.color = this.color(this.COLOR_FG);

            // pararell state
            this.rows[this.cursor.y][this.cursor.x].bg = this.COLOR_BG;
            this.rows[this.cursor.y][this.cursor.x].fg = this.COLOR_FG;
            this.rows[this.cursor.y][this.cursor.x].content = String.fromCharCode(byte);

            // advance cursor
            this.cursor.x += 1;
            if (this.cursor.x >= this.COLUMN_WIDTH) {
                this.cursor.y += 1;
                this.cursor.x = 0;
            }

            i++; continue char_parse_loop;
        }

        this.handleScroll();

        let cursorElement: HTMLElement;

        // clear previous cursor
        // ignore prev cursor if prevcursor not in view
        if (this.container.children[this.prevCursor.y - this.yOffset]) {
            cursorElement = this.container.children[this.prevCursor.y - this.yOffset].children[this.prevCursor.x] as HTMLElement;
            cursorElement.style.backgroundColor = this.color(this.COLOR_BG)
            cursorElement.style.color = this.color(this.COLOR_FG)
        }


        let cy = this.cursor.y - this.yOffset, cx = this.cursor.x;
        let [width, height] = this.cell_dimensions();

        this.ctx.fillStyle = this.color(this.COLOR_FG);
        this.ctx.fillRect(cx * width, cy * height, width, height)

        // clear previous cursor
        if ((this.prevCursor.y >= this.yOffset)) {
            cy = this.prevCursor.y - this.yOffset, cx = this.prevCursor.x;
            this.ctx.fillStyle = this.color(this.COLOR_BG);
            this.ctx.fillRect(cx * width, cy * height, width, height)

            // figure out what goes here
            if (this.rows[this.prevCursor.y]) {
                let cell = this.rows[this.prevCursor.y][this.prevCursor.x];
                if (cell) {
                    this.ctx.fillStyle = this.color(cell.bg);
                    this.ctx.fillRect(cx * width, cy * height, width, height)
                    if (cell.content) {
                        this.ctx.fillStyle = this.color(cell.fg)
                        this.ctx.fillText(cell.content, cx * width, cy * height);
                    }
                }
            };
        }

        // draw current cursor
        cursorElement = this.container.children[this.cursor.y - this.yOffset].children[this.cursor.x] as HTMLElement;
        cursorElement.style.backgroundColor = this.color(this.COLOR_FG)
        cursorElement.style.color = this.color(this.COLOR_BG)
        this.prevCursor.x = this.cursor.x;
        this.prevCursor.y = this.cursor.y;

        // empty buffer 
        this.buffer = new Uint8Array();
    }

    /** This method automagically scrolls the view */
    private handleScroll() {
        // scroll to new line if y is larger than container
        if ((this.cursor.y - this.yOffset) >= this.ROW_HEIGHT) {
            // scroll down
            let diff = (this.cursor.y - this.yOffset + 1) - (this.ROW_HEIGHT);
            // add extra rows to `this.rows`
            for (let i = 0; i < diff; i++) {
                let row = new Array<TerminalRendererCell>(this.COLUMN_WIDTH);
                for (let j = 0; j < row.length; j++) {
                    row[j] = { ...this.EMPTY_CELL }
                }
                this.rows.push(
                    row
                )
            }
            this.yOffset += (diff);
        } else if (this.cursor.y < this.yOffset) {
            this.yOffset -= (this.yOffset - this.cursor.y);

            if (this.yOffset < 0) {
                this.yOffset = 0;
            }
        } else {
            return;
        }

        let [width, height] = this.cell_dimensions();

        this.ctx.fillStyle = this.color(this.COLOR_BG_DEFAULT);
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)

        // shift container rows
        for (let j = 0; j < this.container.children.length; j++) {
            for (let i = 0; i < this.container.children[j].children.length; i++) {
                let cellData = this.rows[j + this.yOffset][i], cellElem = this.container.children[j].children[i] as HTMLElement;


                let cy = j, cx = i;
                this.ctx.fillStyle = this.color(cellData.bg);
                this.ctx.fillRect(cx * width, cy * height, width, height);
                this.ctx.fillStyle = this.color(cellData.fg);
                if (cellData.content) {
                    this.ctx.fillText(cellData.content, cx * width, cy * height)
                }

                cellElem.style.backgroundColor = this.color(cellData.bg)
                cellElem.style.color = this.color(cellData.fg)
                cellElem.innerHTML = cellData.content || this.EMPTY_CHAR;
            }
        }

    }

    private color(n: number) {
        return this.COLORS[n % this.COLORS.length];
    }
}