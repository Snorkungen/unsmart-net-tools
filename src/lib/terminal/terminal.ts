import { uint8_concat, uint8_fromString, uint8_mutateSet, uint8_set } from "../binary/uint8-array";
import { ASCIICodes, CSI, readParams } from "./shared";
export default class Terminal {
    private renderer: TerminalRenderer;
    private container: HTMLElement;

    constructor(container: HTMLElement) {
        this.container = container;

        let canvas = document.createElement("canvas");
        this.container.appendChild(canvas)
        this.container.tabIndex = 0;

        /**
         * The following is a work-around because chromium based browswers be havin' issues
         */
        if (!navigator.userAgent.includes("Chrome")) {
            this.renderer = new TerminalRenderer(canvas);
        } else {
            this.renderer = new TerminalRenderer(canvas);
            /*
                work-around for chromium based browsers that i was having issues with
            */
            setTimeout(() => {
                this.renderer.draw();
            }, 4)

            window.addEventListener("hashchange", () => {
                if (!this.container.isConnected) return;
                this.renderer.draw()
            })
        }

        this.container.addEventListener("mousedown", this.handle_mousedown.bind(this));
        this.container.addEventListener("mousemove", this.handle_mousemove.bind(this));
        this.container.addEventListener("mouseup", this.handle_mouseup.bind(this));
        this.container.addEventListener("mouseleave", this.handle_mouseup.bind(this));
        this.container.addEventListener("click", this.handle_click.bind(this));

        this.container.addEventListener("keydown", this.handle_keydown.bind(this))

        this.container.addEventListener("focus", () => {
            console.log("focused")
            this.container.style.border = "blue 2px solid"; // in future change cursor style
        })
        this.container.addEventListener("blur", () => {
            console.log("focused")
            this.container.style.border = "none"; // in future change cursor style
        })

        this.container.addEventListener("wheel", (event) => {
            if (this.renderer.scrollWindow(event.deltaY > 0 ? 1 : -1)) {
                event.preventDefault()
            }
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
    write_buffer = new Uint8Array(512);
    write_buffer_length = 0;
    write_waiting = false;
    write_timeout = 50;
    write_timeout_callback = (() => {
        if (!this.write_waiting) return;
        this.renderer.buffer = this.write_buffer.subarray(0, this.write_buffer_length);
        this.write_buffer_length = 0;
        this.renderer.render();
        this.write_waiting = false;
    }).bind(this)
    write(bytes: Uint8Array, fast = true) {
        if (fast || (bytes.byteLength + this.write_buffer_length) > this.write_buffer.byteLength) {
            // do some special logic
            if (this.write_buffer_length === 0)
                this.renderer.buffer = bytes;
            else {
                this.renderer.buffer = uint8_concat([this.write_buffer.subarray(0, this.write_buffer_length), bytes]);
                this.write_buffer_length = 0;
            }

            this.renderer.render()
            this.write_waiting = false;
            this.mouse_clear_selections()
            return;
        }

        uint8_mutateSet(this.write_buffer, bytes, this.write_buffer_length);
        this.write_buffer_length += bytes.byteLength;

        // create timeout that checks that the data is the
        if (this.write_waiting)
            return;

        this.write_waiting = true;
        setTimeout(this.write_timeout_callback, this.write_timeout)
    }

    flush() {
        this.renderer.render();
    }


    private mousedepressed: boolean = false;
    private mouse_cell_selections: TerminalRendererHiglight[] = [];
    private mouse_cell_selection_idx = -1;
    private mouse_click_time = 0;
    private mouse_double_click_time = 233;

    private handle_click(event: MouseEvent) {
        (event.currentTarget instanceof HTMLElement) && event.currentTarget.focus()

        if (this.mouse_double_click_time > (event.timeStamp - this.mouse_click_time)) {
            let [x, y] = this.renderer.get_cell_by_mouseevent(event);
            let selection = this.renderer.get_cells_in_row(x, y)
            if (selection[0] == y) {
                this.mouse_cell_selections.length = 1;
                this.mouse_cell_selection_idx = 0;
                this.mouse_cell_selections[this.mouse_cell_selection_idx] = selection;
                this.renderer.highlight_in_row(...selection)
            }
        }

        this.mouse_click_time = event.timeStamp;
    }

    private mouse_clear_selections() {
        this.mouse_cell_selection_idx = -1;
        this.mouse_cell_selections.length = 0;
        this.renderer.highlight_clear();
    }

    // private methods dealing with the selection of text and stuff
    private handle_mousedown(event: MouseEvent) {
        this.mouse_clear_selections();

        if (!!event.button) return;
        this.mousedepressed = true;
        let [x, y] = this.renderer.get_cell_by_mouseevent(event);

        // create a new selection
        let selection: TerminalRendererHiglight = [y, x, -1];
        this.mouse_cell_selection_idx = 0;
        this.mouse_cell_selections.length = 1;
        this.mouse_cell_selections[0] = selection;
    }

    private mousemove_scroll_zone = 4;
    private mousemove_interval_time = 233;
    private mousemove_interval = 0;
    private handle_mousemove(event: MouseEvent, synthetic = false) {
        if (!this.mousedepressed) return;
        if (this.mouse_cell_selection_idx < 0) return;

        if (!synthetic) { // clear interval
            window.clearInterval(this.mousemove_interval);
            this.mousemove_interval = 0;
        }

        let [x, y, , cy] = this.renderer.get_cell_by_mouseevent(event);

        // detect a scroll intention
        let last_selection = this.mouse_cell_selections[this.mouse_cell_selections.length - 1];
        if (last_selection[0] > 0 && cy <= this.mousemove_scroll_zone) { // scroll up
            y += this.renderer.scrollWindow(-1);

            if (!this.mousemove_interval && !synthetic) {
                this.mousemove_interval =
                    window.setInterval(this.handle_mousemove.bind(this), this.mousemove_interval_time, event, true)
            }
        } else if (cy >= (this.renderer.canvas.height) - this.mousemove_scroll_zone) { // scroll down
            y += this.renderer.scrollWindow(1);

            if (!this.mousemove_interval && !synthetic) {
                this.mousemove_interval =
                    window.setInterval(this.handle_mousemove.bind(this), this.mousemove_interval_time, event, true)
            }
        }

        let [yPos, , xEnd] = this.mouse_cell_selections[this.mouse_cell_selection_idx];

        this.renderer.highlight_clear()
        this.mouse_cell_selections.length = 1;

        // create a multiline selection
        if (y < yPos) {
            this.mouse_cell_selections[this.mouse_cell_selection_idx][2] = 0;
            for (let i = yPos - 1; i > y; i--) {
                this.mouse_cell_selections.push([i, 0, this.renderer.COLUMN_WIDTH - 1])
            }

            this.mouse_cell_selections.push([y, x, this.renderer.COLUMN_WIDTH - 1])
        } else if (y > yPos) {
            this.mouse_cell_selections[this.mouse_cell_selection_idx][2] = this.renderer.COLUMN_WIDTH - 1;
            for (let i = yPos + 1; i < y; i++) {
                this.mouse_cell_selections.push([i, 0, this.renderer.COLUMN_WIDTH - 1])
            }

            this.mouse_cell_selections.push([y, 0, x])
        } else {
            xEnd = x;
            this.mouse_cell_selections[this.mouse_cell_selection_idx][2] = xEnd;
        }

        // tell the renderer to highligt the current selection
        for (let [yp, xs, xe] of this.mouse_cell_selections) {
            this.renderer.highlight_in_row(yp, xs, xe);
        }
    }

    private handle_mouseup(_: MouseEvent) {
        this.mousedepressed = false;

        window.clearInterval(this.mousemove_interval);
        this.mousemove_interval = 0;

        if (this.mouse_cell_selection_idx >= 0 && this.mouse_cell_selections[this.mouse_cell_selection_idx][2] < 0) {
            this.mouse_clear_selections()
            return; // mouse never moved
        }
    }

    private handle_keydown(event: KeyboardEvent) {
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

        // Q: should this behaviour be toggled ?
        if (event.key == "Insert" && event.shiftKey) {
            // paste
            let r = this.read;
            navigator.clipboard.readText().then((value) => {
                r(uint8_fromString(value))
            }).catch(() => null);
        } else if (event.key == "Insert" && event.ctrlKey) {
            let text = this.renderer.get_text_by_cell_selections(this.mouse_cell_selections);
            if (text) {
                navigator.clipboard.writeText(text).catch(() => null);
            }
        }

        if (buffer == undefined) {
            return;
        }

        this.read(buffer);

        // PREVENT Something unexpected
        event.preventDefault();
        event.stopPropagation()
    }
}

type TerminalRendererHiglight = [row: number, xStart: number, xEnd: number];

type TerminalRendererCursor = {
    x: number;
    y: number;
}

/** i want to make this just a linear Uint8Array */
type TerminalRendererCell = {
    byte: number;
    fg: number;
    bg: number;
    // space for future
}
export class TerminalRenderer {
    // options start
    COLUMN_WIDTH = 80;
    ROW_HEIGHT = 2 * 8;
    visible_columns = this.COLUMN_WIDTH;

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
    FONT = "18px monospace";
    TEXT_BASE_LINE: CanvasTextBaseline = "top";
    EMPTY_CELL = {
        byte: 0,
        fg: this.COLOR_FG,
        bg: this.COLOR_BG,
    };
    // options end

    private rows: TerminalRendererCell[][];
    private yOffset: number = 0;

    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;

    private cell_dimensions_cached?: [width: number, height: number, wdiff: number];
    private cell_dimensions(): [width: number, height: number, wdiff: number] {
        if (this.cell_dimensions_cached) {
            return this.cell_dimensions_cached;
        }
        this.ctx.textBaseline = this.TEXT_BASE_LINE
        this.ctx.font = this.FONT;
        let mt = this.ctx.measureText("_");
        this.cell_dimensions_cached = [
            Math.ceil(mt.width) || 11,
            Math.ceil(mt.fontBoundingBoxDescent + mt.fontBoundingBoxAscent) || 23,
            Math.ceil(mt.width) - mt.width || 0
        ];
        return this.cell_dimensions_cached;
    }

    private _actually_draw_cells(y: number, start: number, end: number, fg: number, bg: number, type: number, buffer: number[],) {
        let [width, height, letterSpacing] = this.cell_dimensions();

        // draw blank lines
        this.ctx.fillStyle = this.color(bg);
        this.ctx.fillRect(start * width, (y - this.yOffset) * height, width * (end - start + 1), height)

        if (type > 0 && buffer.length) {
            this.ctx.textBaseline = this.TEXT_BASE_LINE
            this.ctx.font = this.FONT;
            this.ctx.fillStyle = this.color(fg);
            this.ctx.letterSpacing = letterSpacing.toString() + "px";
            this.ctx.fillText(String.fromCharCode(...buffer), start * width, (y - this.yOffset) * height + (width / 5))
        }
    }

    /** Attempt to draw multiple cells at once */
    private draw_cells(y: number, start: number, end: number): void;
    private draw_cells(y: number, start: number, end: number, fg: number, bg: number): void;
    private draw_cells(y: number, start: number, end: number, fg: number = -1, bg: number = -1) {
        let colors_given = fg >= 0 && bg >= 0;
        let row = this.rows[y];

        let type = 0;
        let buffer: number[] = [];
        for (let i = start; i <= Math.min(row.length - 1, end); i++) {
            let cell = row[i];

            if (
                (!colors_given && (fg != cell.fg || bg != cell.bg)) ||
                (type == 0 && cell.byte > 0) ||
                (type > 0 && cell.byte == 0)
            ) {
                this._actually_draw_cells(y, start, i, fg, bg, type, buffer);

                start = i;
                if (!colors_given) {
                    fg = cell.fg;
                    bg = cell.bg;
                }
                type = cell.byte;
                buffer.length = 0;
            }

            // record information
            if (type > 0) {
                buffer.push(cell.byte)
            }
        }

        this._actually_draw_cells(y, start, end, fg, bg, type, buffer);
    }

    private draw_cursor() {
        // draw current cursor
        let cell = this.rows[this.cursor.y][this.cursor.x];
        this.draw_cells(this.cursor.y, this.cursor.x, this.cursor.x, cell.bg, cell.fg);

        // clear previous cursor
        if (this.prevCursor.y == this.cursor.y && this.prevCursor.x == this.cursor.x) {
            return
        }

        if ((this.prevCursor.y >= this.yOffset) && this.prevCursor.y < this.rows.length) {
            this.draw_cells(this.prevCursor.y, this.prevCursor.x, this.prevCursor.x);
        }

        this.prevCursor.x = this.cursor.x;
        this.prevCursor.y = this.cursor.y;
    }

    draw() {
        // clear canvas
        this.ctx.fillStyle = this.color(this.COLOR_BG_DEFAULT);
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)

        // shift container rows
        for (let j = 0; j < this.ROW_HEIGHT; j++) {
            this.draw_cells((j + this.yOffset), 0, this.rows[j + this.yOffset].length - 1);
        }

        if (this.cursorInView()) {
            this.draw_cursor()
        }

        this.higlight_draw();

        this.handleScrollResult = false;
        this.modified_cells = [];
    }

    scrollWindow(direction: number): number {
        let tmp = this.yOffset;
        this.yOffset = (Math.max(0, Math.min(this.yOffset + direction, this.rows.length - this.ROW_HEIGHT)))
        this.draw();
        return this.yOffset - tmp;
    }

    private view_initialized = false;
    init_view() {
        if (this.canvas.parentElement && this.canvas.parentElement.clientWidth != 0) {
            let cw = this.canvas.parentElement.clientWidth;
            let [width] = this.cell_dimensions();

            let max_columns = Math.floor(cw / width);
            if (max_columns < this.COLUMN_WIDTH && max_columns != this.visible_columns) {
                this.visible_columns = max_columns;
                this.canvas.width = width * max_columns;

                this.view_initialized = false;
            }
        }

        if (this.view_initialized) return

        this.draw();
        this.view_initialized = true;
    }

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = this.canvas.getContext("2d")!;

        let [width, height] = this.cell_dimensions();
        this.canvas.width = this.COLUMN_WIDTH * width;
        this.canvas.height = this.ROW_HEIGHT * height;

        // init rows
        this.rows = new Array<TerminalRendererCell[]>(this.ROW_HEIGHT);
        // fill container with rows
        for (let i = 0; i < this.ROW_HEIGHT; i++) {
            // duplicate state
            this.rows[i] = new Array<TerminalRendererCell>(this.COLUMN_WIDTH);
            for (let j = 0; j < this.COLUMN_WIDTH; j++) {
                // duplicate state
                this.rows[i][j] = {
                    ...this.EMPTY_CELL
                }
            }
        }

        window.setTimeout(this.init_view.bind(this), 1);
        window.addEventListener("resize", this.init_view.bind(this));
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

    private cursorInView(): boolean {
        return this.cursor.y >= this.yOffset && this.cursor.y < this.yOffset + this.ROW_HEIGHT;
    }

    private _eraseCell(x: number, y: number) {
        this.handleScroll();


        if (this.rows[y] && this.rows[y][x]) {
            this.mark_cell_as_modified(x, y)
            this.rows[y][x].bg = this.COLOR_BG;
            this.rows[y][x].fg = this.COLOR_FG;
            this.rows[y][x].byte = 0;
        }
    }

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
        if (!this.cursorInView()) throw new Error("Erasing is not supported when cursor not in view")
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

            let finalByte = rawParams.pop();

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


    private modified_cells: { [y: number]: [first: number, last: number] } = [];
    private mark_cell_as_modified(x: number, y: number) {
        if (this.modified_cells[this.cursor.y]) {
            //  expand the range of cells etc
            if (this.modified_cells[this.cursor.y][0] > this.cursor.x) {
                this.modified_cells[this.cursor.y][0] = this.cursor.x;
            } else if (this.modified_cells[this.cursor.y][1] < this.cursor.x) {
                this.modified_cells[this.cursor.y][1] = this.cursor.x;
            }
        } else {
            this.modified_cells[this.cursor.y] = [this.cursor.x, this.cursor.x]
        }
    }

    render() {
        if (!this.canvas) {
            throw new Error("container missing can't render")
        }

        this.highlight_clear()

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

            this.mark_cell_as_modified(this.cursor.x, this.cursor.y)
            this.rows[this.cursor.y][this.cursor.x].bg = this.COLOR_BG;
            this.rows[this.cursor.y][this.cursor.x].fg = this.COLOR_FG;
            this.rows[this.cursor.y][this.cursor.x].byte = byte;

            // advance cursor
            this.cursor.x += 1;
            if (this.cursor.x >= this.COLUMN_WIDTH) {
                this.cursor.y += 1;
                this.cursor.x = 0;
            }

            i++; continue char_parse_loop;
        }

        this.handleScroll();

        if (this.handleScrollResult) {
            this.draw();
        } else { // draw the touched cells
            for (let [sy, [xs, xe]] of Object.entries(this.modified_cells)) {
                this.draw_cells(parseInt(sy), xs, xe)
            }
            this.modified_cells = [];
            this.draw_cursor();
        }

        // empty buffer
        this.buffer = new Uint8Array();
    }

    /** flag that denotes wether handleScroll updated the state, and for the consumer to call draw */
    private handleScrollResult = false;
    /** This method automagically scrolls the view \
     * Ensures that the cursor is in view, and create new rows if needed
     */
    private handleScroll() {
        // check if the cursor is in view
        if (this.cursorInView()) return;

        let diff = this.cursor.y - (this.yOffset + (this.ROW_HEIGHT - 1));
        this.yOffset = Math.max(0, this.yOffset + diff);

        // create new rows if required
        if ((this.yOffset + this.ROW_HEIGHT) > this.rows.length) {
            for (let i = 0; i < ((this.yOffset + this.ROW_HEIGHT + 1) - this.rows.length); i++) {
                let row = new Array<TerminalRendererCell>(this.COLUMN_WIDTH);
                for (let j = 0; j < row.length; j++) {
                    row[j] = { ...this.EMPTY_CELL }
                }
                this.rows.push(
                    row
                )
            }
        }

        if (this.cursor.y >= this.rows.length) {
            throw new Error("cursor still not in view")
        }

        this.handleScrollResult = true;
    }

    private color(n: number) {
        return this.COLORS[n % this.COLORS.length];
    }


    private higlights: TerminalRendererHiglight[] = [];
    // clear all active highligts
    highlight_clear() {
        for (let higlight of this.higlights) {
            if (higlight[0] < this.yOffset || higlight[0] >= (this.yOffset + this.ROW_HEIGHT)) continue;

            this.draw_cells(higlight[0], higlight[1], higlight[2])

            if (this.cursor.y == higlight[0]) {
                this.draw_cursor()
            }
        }

        this.higlights.length = 0;
    }
    highlight_in_row(y: number, xStart: number, xEnd: number) {
        if (xEnd < xStart) {
            let tmp = xStart;
            xStart = xEnd;
            xEnd = tmp;
        }

        this.higlights.push([y, xStart, xEnd]);

        if (y < this.yOffset || y >= (this.yOffset + this.ROW_HEIGHT)) {
            return
        };

        this.draw_cells(y, xStart, xEnd, this.COLOR_BG, this.COLOR_FG);
    }

    private higlight_draw() {
        for (let higlight of this.higlights) {
            if (higlight[0] < this.yOffset || higlight[0] >= (this.yOffset + this.ROW_HEIGHT)) continue;

            this.draw_cells(higlight[0], higlight[1], higlight[2], this.COLOR_BG, this.COLOR_FG);

            if (this.cursor.y == higlight[0]) {
                this.draw_cursor()
            }
        }
    }

    get_cell_by_mouseevent(event: MouseEvent): [x: number, y: number, rx: number, ry: number] {
        let [cw, ch] = this.cell_dimensions();
        let rect = (this.canvas as HTMLElement).getBoundingClientRect();
        let rx = Math.max(0, event.clientX - rect.left), ry = Math.max(0, event.clientY - rect.top);
        let max_width = cw * this.COLUMN_WIDTH,
            max_height = ch * this.ROW_HEIGHT;

        if (rx > max_width || ry > max_height) {
            return [this.COLUMN_WIDTH - 1, this.yOffset + this.ROW_HEIGHT - 1, rx, ry];
        }

        let x = Math.floor(rx / cw), y = this.yOffset + Math.floor(ry / ch);
        return [x, y, rx, ry]
    }

    get_cells_in_row(x: number, y: number): TerminalRendererHiglight {
        let start = x, end = x;
        // find the start of the thing
        let row = this.rows[y];

        if (row[x].byte == 0 || row[x].byte == 32) { // nothing to select
            return [-1, -1, -1]
        }

        for (start -= 1; start >= 0; start--) {
            if (row[start].byte == 0 || row[start].byte == 32) break;
        }

        for (end += 1; end < row.length; end++) {
            if (row[end].byte == 0 || row[end].byte == 32) break;
        }

        return [y, start + 1, end - 1];
    }

    get_text_by_cell_selections(selections: TerminalRendererHiglight[]): string {
        // do not trust the given selections order sort so that smallest y is first
        let result = "";
        if (!selections.length) return result;

        selections.sort(([a], [b]) => a - b);
        let last_row = selections[selections.length - 1][0];

        let row: TerminalRendererCell[];
        for (let [y, xs, xe] of selections) {
            if (xs > xe) { // swapping
                xs = xs + xe;
                xe = xs - xe;
                xs = xs - xe;
            }

            row = this.rows[y];

            // find edge and stuff ...
            for (; xe >= xs; xe--) {
                if (row[xe].byte != 0) break;
            }

            for (; xs <= xe; xs++) {
                result += String.fromCharCode(row[xs].byte);
            }

            if (y < last_row) {
                // add newline
                result += String.fromCharCode(ASCIICodes.NewLine)
            }
        }

        return result;
    }
}