import { uint8_concat, uint8_fromString, uint8_mutateSet, uint8_set } from "../binary/uint8-array";
import { TerminalRendererCursor, TerminalRendererCell, TerminalRendererState, terminal_render, terminal_resize } from "./renderer";
import { ASCIICodes, CSI } from "./shared";

export default class Terminal {
    renderer: TerminalRenderer;
    private container: HTMLElement;

    constructor(container: HTMLElement) {
        this.container = container;

        let canvas = document.createElement("canvas");
        this.container.appendChild(canvas)
        this.container.tabIndex = 0;

        this.renderer = new TerminalRenderer(canvas);

        const mutation_observer = new MutationObserver(() => {
            if (!this.container.isConnected) return;

            if (this.write_buffer_length) {
                this.renderer.buffer = uint8_concat([this.renderer.buffer, this.write_buffer.subarray(0, this.write_buffer_length)]);
                this.write_buffer_length = 0;
            }

            this.renderer.render()
        });

        const resize_observer = new ResizeObserver(() => {
            if (!this.container.isConnected) return;
            if (!this.container.clientWidth) return;

            let [width] = this.renderer.cell_dimensions();
            this.renderer.view_columns = Math.max(
                22,
                Math.floor(this.container.clientWidth / width)
            );

            this.renderer.canvas.width = width * this.renderer.view_columns;


            terminal_resize(this.renderer); // TODO: the following function does not do what it supposed to do

            this.renderer.draw()
        })

        mutation_observer.observe(document, { childList: true, subtree: true })
        resize_observer.observe(this.container)

        this.container.addEventListener("mousedown", this.handle_mousedown.bind(this));
        this.container.addEventListener("mousemove", this.handle_mousemove.bind(this));
        this.container.addEventListener("mouseup", this.handle_mouseup.bind(this));
        this.container.addEventListener("mouseleave", this.handle_mouseup.bind(this));
        this.container.addEventListener("click", this.handle_click.bind(this));

        this.container.addEventListener("keydown", this.handle_keydown.bind(this))

        this.container.style.border = "transparent 2px solid"; // in future change cursor style
        this.container.addEventListener("focus", () => {
            this.container.style.border = "blue 2px solid"; // in future change cursor style
        })
        this.container.addEventListener("blur", () => {
            this.container.style.border = "transparent 2px solid";// in future change cursor style
        })

        this.container.addEventListener("wheel", (event) => {
            if (this.renderer.scrollWindow(event.deltaY > 0 ? 1 : -1)) {
                event.preventDefault()
            }
        })
    }

    read?: (bytes: Uint8Array) => void;

    // this is a temporary implementation
    write_buffer = new Uint8Array(512);
    write_buffer_length = 0;
    write_waiting = false;
    write_timeout = 50;
    write_timeout_callback = (() => {
        if (!this.write_waiting && this.container.isConnected) return;
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

            if (this.container.isConnected) {
                this.renderer.render()
            }

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
                this.mouse_cell_selections.push([i, 0, this.renderer.view_columns - 1])
            }

            this.mouse_cell_selections.push([y, x, this.renderer.view_columns - 1])
        } else if (y > yPos) {
            this.mouse_cell_selections[this.mouse_cell_selection_idx][2] = this.renderer.view_columns - 1;
            for (let i = yPos + 1; i < y; i++) {
                this.mouse_cell_selections.push([i, 0, this.renderer.view_columns - 1])
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

export class TerminalRenderer implements TerminalRendererState {
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

    view_columns = 80;
    view_rows = 2 * 8;

    view_modified = false;
    modified_cells: { [y: number]: [first: number, last: number] } = [];
    resize_markers: number[] = [];

    DEFAULT_COLOR_BG = 0 % this.COLORS.length;
    DEFAULT_COLOR_FG = 7 % this.COLORS.length;
    color_bg = this.DEFAULT_COLOR_BG;
    color_fg = this.DEFAULT_COLOR_FG;

    prev_cursor: TerminalRendererCursor = { x: 0, y: 0 };
    cursor: TerminalRendererCursor = { x: 0, y: 0 };
    y_offset = 0;

    // options start
    FONT = "18px monospace";
    TEXT_BASE_LINE: CanvasTextBaseline = "top";

    // options end

    rows: TerminalRendererCell[][];

    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = this.canvas.getContext("2d")!;


        let [width, height] = this.cell_dimensions();
        this.canvas.width = this.view_columns * width;
        this.canvas.height = this.view_rows * height;

        this.ctx.fillStyle = this.color(this.color_bg);
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // init rows
        this.rows = new Array<TerminalRendererCell[]>(this.view_rows);

        // fill container with rows
        for (let i = 0; i < this.view_rows; i++) {
            // duplicate state
            this.rows[i] = new Array<TerminalRendererCell>(this.view_columns);
            for (let j = 0; j < this.view_columns; j++) {
                // duplicate state
                this.rows[i][j] = { fg: this.color_fg, bg: this.color_bg, byte: 0 }
            }
        }
    }

    private cell_dimensions_cached?: [width: number, height: number, wdiff: number];
    cell_dimensions(): [width: number, height: number, wdiff: number] {
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
        this.ctx.fillRect(start * width, (y - this.y_offset) * height, width * (end - start + 1), height)

        if (type > 0 && buffer.length) {
            this.ctx.textBaseline = this.TEXT_BASE_LINE
            this.ctx.font = this.FONT;
            this.ctx.fillStyle = this.color(fg);
            this.ctx.letterSpacing = letterSpacing.toString() + "px";
            this.ctx.fillText(String.fromCharCode(...buffer), start * width, (y - this.y_offset) * height + (width / 5))
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
        if (this.prev_cursor.y == this.cursor.y && this.prev_cursor.x == this.cursor.x) {
            return
        }

        if ((this.prev_cursor.y >= this.y_offset) && this.prev_cursor.y < this.rows.length) {
            this.draw_cells(this.prev_cursor.y, this.prev_cursor.x, this.prev_cursor.x);
        }

        this.prev_cursor.x = this.cursor.x;
        this.prev_cursor.y = this.cursor.y;
    }

    draw() {
        // shift container rows
        for (let j = 0; j < this.view_rows; j++) {
            this.draw_cells((j + this.y_offset), 0, this.rows[j + this.y_offset].length - 1);
        }

        if (this.cursorInView()) {
            this.draw_cursor()
        }

        this.higlight_draw();

        this.view_modified = false;
        this.modified_cells = [];
    }

    scrollWindow(direction: number): number {
        let tmp = this.y_offset;
        this.y_offset = (Math.max(0, Math.min(this.y_offset + direction, this.rows.length - this.view_rows)))
        this.draw();
        return this.y_offset - tmp;
    }

    buffer: Uint8Array = new Uint8Array();

    private cursorInView(): boolean {
        return this.cursor.y >= this.y_offset && this.cursor.y < this.y_offset + this.view_rows;
    }

    render() {
        if (!this.canvas) {
            throw new Error("container missing can't render")
        }

        this.highlight_clear()

        terminal_render(this, this.buffer);

        if (this.view_modified) {
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

    private color(n: number) {
        return this.COLORS[n % this.COLORS.length];
    }

    private higlights: TerminalRendererHiglight[] = [];
    // clear all active highligts
    highlight_clear() {
        for (let higlight of this.higlights) {
            if (higlight[0] < this.y_offset || higlight[0] >= (this.y_offset + this.view_rows)) continue;

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

        if (y < this.y_offset || y >= (this.y_offset + this.view_rows)) {
            return
        };

        this.draw_cells(y, xStart, xEnd, this.color_bg, this.color_fg);
    }

    private higlight_draw() {
        for (let higlight of this.higlights) {
            if (higlight[0] < this.y_offset || higlight[0] >= (this.y_offset + this.view_rows)) continue;

            this.draw_cells(higlight[0], higlight[1], higlight[2], this.color_bg, this.color_fg);

            if (this.cursor.y == higlight[0]) {
                this.draw_cursor()
            }
        }
    }

    get_cell_by_mouseevent(event: MouseEvent): [x: number, y: number, rx: number, ry: number] {
        let [cw, ch] = this.cell_dimensions();
        let rect = (this.canvas as HTMLElement).getBoundingClientRect();
        let rx = Math.max(0, event.clientX - rect.left), ry = Math.max(0, event.clientY - rect.top);
        let max_width = cw * this.view_columns,
            max_height = ch * this.view_rows;

        if (rx > max_width || ry > max_height) {
            return [this.view_columns - 1, this.y_offset + this.view_rows - 1, rx, ry];
        }

        let x = Math.floor(rx / cw), y = this.y_offset + Math.floor(ry / ch);
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