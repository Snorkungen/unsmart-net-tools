/*
    This file contains function that do all the hardwork that, does not concern the DOM
*/

import { ASCIICodes, readParams } from "./shared";

export type TerminalRendererCursor = {
    x: number;
    y: number;
}

/** i want to make this just a linear Uint8Array */
export type TerminalRendererCell = {
    byte: number;
    fg: number;
    bg: number;
    // space for future
}

export type TerminalRendererState = {
    view_columns: number;
    view_rows: number;

    /** denotes wheter entire view shoul be re drawn */
    view_modified: boolean;
    modified_cells: { [y: number]: [first: number, last: number] };

    DEFAULT_COLOR_BG: number;
    DEFAULT_COLOR_FG: number;
    color_bg: number;
    color_fg: number;

    cursor: TerminalRendererCursor;
    prev_cursor: TerminalRendererCursor;

    y_offset: number;
    rows: TerminalRendererCell[][];

    resize_markers: [end: number, row_count: number][];
}

function terminal_cursor_in_view(state: TerminalRendererState, cursor = state.cursor) {
    return cursor.y >= state.y_offset && cursor.y < (state.y_offset + state.view_rows)
}
/** Ensures that there is a row for the current cursor position */
function terminal_ensure_cursor_in_view(state: TerminalRendererState) {
    if (terminal_cursor_in_view(state)) {
        return;
    }

    let diff = state.cursor.y - (state.y_offset + (state.view_rows - 1));
    state.y_offset = Math.max(0, state.y_offset + diff);

    // create new rows if required
    if ((state.y_offset + state.view_rows) > state.rows.length) {
        for (let i = 0; i < ((state.y_offset + state.view_rows + 1) - state.rows.length); i++) {
            let row = new Array<TerminalRendererCell>(state.view_columns);
            for (let j = 0; j < row.length; j++) {
                row[j] = { byte: 0, bg: state.color_bg, fg: state.color_fg };
            }
            state.rows.push(row);
        }
    }

    if (state.cursor.y >= state.rows.length) {
        throw new Error("cursor not in view")
    }

    state.view_modified = true;
}

export function terminal_mark_cell_as_modified(state: TerminalRendererState, x: number, y: number) {
    if (state.modified_cells[y]) {
        if (state.modified_cells[y][0] > x) {
            state.modified_cells[y][0] = x;
        } else if (state.modified_cells[y][1] < x) {
            state.modified_cells[y][1] = x;
        }
    } else {
        state.modified_cells[y] = [x, x];
    }

    // invalidate resize_marker
    for (let i = y; i >= 0; i--) {
        if (!state.resize_markers[i]) continue;

        if (state.resize_markers[i][1] + i >= y) {
            // invalidate marker some how

            // if there multiple rows above
            let diff = (y - i);
            if (diff == 0 || diff == 1) {
                delete state.resize_markers[i];
            } else {
                state.resize_markers[i][0] = (diff) * state.view_columns - 1; // change the end
                state.resize_markers[i][1] = (diff - 1) // change the row count
            }

            break;
        }
    }
}

function terminal_erase_cell(state: TerminalRendererState, x: number, y: number) {
    terminal_ensure_cursor_in_view(state);

    {
        terminal_mark_cell_as_modified(state, x, y);
        state.rows[y][x].bg = state.color_bg;
        state.rows[y][x].fg = state.color_fg;
        state.rows[y][x].byte = 0;
    }
}

function terminal_erase_in_line(state: TerminalRendererState, n: number) {
    if (n == 0) { // clear from cursor to end
        for (let x = state.cursor.x; x > state.view_columns; x++) {
            terminal_erase_cell(state, x, state.cursor.y);
        }
    } else if (n == 1) { // clear from cursor to begin
        for (let x = state.cursor.x; x >= 0; x--) {
            terminal_erase_cell(state, x, state.cursor.y);
        }
    } else if (n == 2) { // clear entire row
        for (let x = 0; x < state.view_columns; x++) {
            terminal_erase_cell(state, x, state.cursor.y);
        }
    }
}

function terminal_erase_display(state: TerminalRendererState, n: number) {
    if (n == 2) { // clear entire display
        state.cursor.x = 0;
        state.cursor.y = 0;

        terminal_ensure_cursor_in_view(state);
        n = 0;
    }

    if (n == 0) { // clear from cursor to end
        let posInView = state.cursor.y - state.y_offset;
        let rowsAfterView = state.rows.length - (state.cursor.y + (state.view_rows - 1) + posInView) - 1;
        for (let i = 1; i <= rowsAfterView; i++) {
            state.rows.pop();
        }

        let rowsInViewToBeErased = (state.view_rows - 1) - posInView;

        for (let y = state.cursor.y; y <= state.cursor.y + rowsInViewToBeErased; y++) {
            for (let x = 0; x < state.view_columns; x++) {
                terminal_erase_cell(state, x, y);
            }
        }
    } else if (n == 1) { // clear from cursor to begin
        let posInView = state.cursor.y - state.y_offset;
        let rowsBeforeView = state.cursor.y - posInView;
        for (let i = 0; i < rowsBeforeView; i++) {
            state.rows.shift();
        }

        state.prev_cursor.y -= rowsBeforeView;
        state.cursor.y = posInView;
        state.y_offset = 0;

        for (let y = state.cursor.y; y >= 0; y--) {
            for (let x = 0; x < state.view_columns; x++) {
                terminal_erase_cell(state, x, y);
            }
        }
    }
}


function terminal_select_graphic_rendition(state: TerminalRendererState, n: number) {
    if (n == 0) { // reset all attributes
        state.color_bg = state.DEFAULT_COLOR_BG;
        state.color_fg = state.DEFAULT_COLOR_FG;
    }

    // only support setting colours

    if (n == 7) { // invert colours
        let tmp = state.color_bg;
        state.color_bg = state.color_fg;
        state.color_fg = tmp;
    }


    if (n >= 30 && n <= 37) { // set foreground colour
        state.color_fg = n - 30;
    }

    if (n >= 40 && n <= 47) { // set background colour
        state.color_bg = n - 40;
    }
}

function terminal_handle_escape_sequences(state: TerminalRendererState, buffer: Uint8Array, i: number): number {
    let byte = buffer[i];

    if (byte == ASCIICodes.OpenSquareBracket) {
        let rawParams: number[] = [];
        while (++i < buffer.byteLength) {
            byte = buffer[i];
            if (byte >= 0x30 && byte <= 0x3f) {
                rawParams.push(byte);
            } else if (byte >= 0x40 && byte <= 0x7E) {
                rawParams.push(byte);
                break;
            } else {
                return -1;
            }
        }

        if (rawParams.length == 0) {
            return -1;
        }

        let finalByte = rawParams.pop()!;

        switch (finalByte) {
            case ASCIICodes.A /* Cursor up */: {
                let params = readParams(rawParams, 1, 1);
                state.cursor.y = Math.max(state.cursor.y - params[0], 0);
            }; break;
            case ASCIICodes.B /* Cursor down */: {
                let params = readParams(rawParams, 1, 1)
                state.cursor.y += params[0];
            }; break;
            case ASCIICodes.C /* Cursor forward */: {
                let params = readParams(rawParams, 1, 1);
                state.cursor.x = Math.min(state.cursor.x + params[0], state.view_columns);
            }; break;
            case ASCIICodes.D /* Cursor backward */: {
                let params = readParams(rawParams, 1, 1);
                state.cursor.x = Math.max(state.cursor.x - params[0], 0);
            }; break;
            case ASCIICodes.E /* Cursor next line */: {
                let params = readParams(rawParams, 1, 1);
                state.cursor.y += params[0];
                state.cursor.x = 0;
            }; break;
            case ASCIICodes.F /* Cursor previous line */: {
                let params = readParams(rawParams, 1, 1);
                state.cursor.y = Math.max(state.cursor.y - params[0], 0);
                state.cursor.x = 0;
            }; break;
            case ASCIICodes.G /* set horizontal absolute */: {
                let params = readParams(rawParams, 1, 1);
                // params are 1-based, correct
                params[0] && (params[0] -= 1);
                state.cursor.x = Math.min(params[0], state.view_columns);
            }; break;
            case ASCIICodes.H: case ASCIICodes.f:  /* set Cursor position */ {
                let [row, col] = readParams(rawParams, 1, 2);
                // ESC [ <y> ; <x> H <https://github.com/0x5c/VT100-Examples/blob/master/vt_seq.md#simple-cursor-positioning>
                row = Math.max(row - 1, 0);
                col = Math.max(col - 1, 0); // 1-based

                state.cursor.x = Math.min(col, state.view_columns);
                state.cursor.y = row;
            }; break;
            case ASCIICodes.J /* erase display */: {
                let [n] = readParams(rawParams, 2, 1);
                terminal_erase_display(state, n);
            }; break;
            case ASCIICodes.K /* erase in line */: {
                let [n] = readParams(rawParams, 2, 1);
                terminal_erase_in_line(state, n)
            }; break;
            case ASCIICodes.S /* page up */: {
                let [n] = readParams(rawParams, 1, 1);
                if (n <= 0) break;

                state.cursor.y = Math.max(
                    Math.floor(state.cursor.y / state.view_rows) - n,
                    0
                ) * state.view_rows;
                state.view_modified = true;
            }; break;
            case ASCIICodes.T /* page down */: {
                let [n] = readParams(rawParams, 1, 1);
                let tmp = state.view_rows;
                state.cursor.y = (Math.floor(state.cursor.y / state.view_rows) + n) * state.view_rows + tmp;
                terminal_ensure_cursor_in_view(state);
                state.cursor.y -= tmp;
            }; break;
            case ASCIICodes.m /* select graphics rendition */: {
                let [n] = readParams(rawParams, 0);
                terminal_select_graphic_rendition(state, n);
            }; break;

            default: return -1; // unhandled control sequence
        }

        return i;
    }

    return i;
}

export function terminal_render(state: TerminalRendererState, buffer: Uint8Array) {
    // highlights are a just a visual thing not stateful, in that sense


    let i = 0;
    char_parse_loop: while (i < buffer.byteLength) {
        let byte = buffer[i];

        // INSPIRATION <https://en.wikipedia.org/wiki/ANSI_escape_code>
        switch (byte) {
            case ASCIICodes.NUL: i++; continue char_parse_loop;

            case ASCIICodes.BackSpace: {
                // handle backspace
                state.cursor.x -= 1
                if (state.cursor.x < 0) {
                    state.cursor.x = state.view_columns - 1;
                    state.cursor.y -= 1;
                    if (state.cursor.y < 0) {
                        state.cursor.y = 0;
                        state.cursor.x = 0;
                        break;
                    }
                }
                terminal_erase_cell(state, state.cursor.x, state.cursor.y)
                break;
            }
            case ASCIICodes.Tab: {
                state.cursor.x += 8 - state.cursor.x % 8;
                if (state.cursor.x >= state.view_columns) {
                    state.cursor.x = 0;
                    state.cursor.y += 1;
                }
                break;
            } case ASCIICodes.NewLine: {
                state.cursor.x = 0;
                state.cursor.y += 1
                break;
            }
            case ASCIICodes.CarriageReturn: {
                state.cursor.x = 0;
                break;
            }
            case ASCIICodes.Escape: {
                // move on to next byte
                // increment index
                i += 1;
                if (i > buffer.byteLength) {
                    return;
                }

                let tmp = i;
                i = terminal_handle_escape_sequences(state, buffer, i);
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

        terminal_ensure_cursor_in_view(state);

        {
            terminal_mark_cell_as_modified(state, state.cursor.x, state.cursor.y);
            state.rows[state.cursor.y][state.cursor.x].bg = state.color_bg;
            state.rows[state.cursor.y][state.cursor.x].fg = state.color_fg;
            state.rows[state.cursor.y][state.cursor.x].byte = byte;
        }

        // advance cursor
        state.cursor.x += 1;
        if (state.cursor.x >= state.view_columns) {
            state.cursor.y += 1;
            state.cursor.x = 0;
        }

        i++;
        continue char_parse_loop;
    }

    terminal_ensure_cursor_in_view(state);
}

/** modify the row sizes to match state.view_columns */
export function terminal_resize(state: TerminalRendererState) {
    for (let y = 0; y < state.rows.length; y++) {
        if (state.view_columns === state.rows[y].length) break; // do no work
        let sy = y;
        let orig_len = state.rows[sy].length;

        let orig_y_offset = state.y_offset, y_offset_decremented = 0;

        // if there are markers then join everything onto a single row for now
        if (state.resize_markers[sy]) {
            let [end, rc] = state.resize_markers[sy];
            let start = state.rows[sy].length;
            state.rows[sy].length = end + 1;

            outer: for (let i = 1; i <= rc; i++) {
                while (state.rows[sy + i].length) {
                    state.rows[sy][start++] = state.rows[sy + i].shift()!;

                    if (start > end || start >= state.rows[sy].length) {
                        break outer;
                    }
                }
            }

            // delete the rows after
            state.rows.splice(sy + 1, rc);

            delete state.resize_markers[sy];
            for (let i = sy; i < state.resize_markers.length; i++) {
                if (!state.resize_markers[i]) continue;

                state.resize_markers[i - rc] = state.resize_markers[i];
                delete state.resize_markers[i];
            }

            // correct cursor ...
            if (state.cursor.y > sy && state.cursor.y <= sy + rc) {
                state.cursor.x = (state.cursor.y - sy) * orig_len + state.cursor.x;
                state.cursor.y -= state.cursor.y - sy;
                // I do not trust this

            } else if (state.cursor.y > sy) {
                state.cursor.y -= rc;
            }

            // correct y_offset
            if (state.y_offset > sy && state.y_offset <= sy + rc) {
                y_offset_decremented = (state.y_offset - sy)
                state.y_offset -= y_offset_decremented;
            }
        }

        if (state.rows[sy].length <= state.view_columns) {
            let start = state.rows[sy].length;
            state.rows[sy].length = state.view_columns;

            // pad out the rest of the row
            for (let i = start; i < state.rows[sy].length; i++) {
                state.rows[sy][i] = { fg: state.color_fg, bg: state.color_bg, byte: 0 };
            }

            continue;
        }

        let end = state.rows[sy].length - 1;
        for (; state.rows[sy][end].byte == 0 && end > 0; end--) { };

        if (state.cursor.y == sy) {
            end = Math.max(state.cursor.x, end);
        }

        if (end < state.view_columns) {
            state.rows[sy].length = state.view_columns;
            continue;
        }

        let nrow = new Array<TerminalRendererCell>(state.view_columns);
        for (let i = state.view_columns; i <= end; i++) {
            if (i > state.view_columns && (i % state.view_columns) == 0) {
                y += 1;
                state.rows.splice(y, 0, nrow);
                nrow = new Array<TerminalRendererCell>(state.view_columns);
            }

            nrow[i % state.view_columns] = state.rows[sy][i];
        }

        y += 1;
        state.rows.splice(y, 0, nrow);
        state.resize_markers[sy] = [end, y - sy];

        // pad out the rest of the row
        for (let i = end % state.view_columns + 1; i < state.view_columns; i++) {
            state.rows[y][i] = { fg: state.color_fg, bg: state.color_bg, byte: 0 };
        }

        state.rows[sy].length = state.view_columns;

        // increment resize markers
        let inc = y - sy;
        for (let i = state.resize_markers.length; i > sy; i--) {
            if (!state.resize_markers[i]) continue;
            state.resize_markers[i + inc] = state.resize_markers[i];
            delete state.resize_markers[i];
        }

        // this would be easy but the resize markers mess with the state
        if (state.cursor.y == sy && state.cursor.x >= state.view_columns) {
            // count how much is this after
            let count = state.cursor.x - (state.view_columns - 1);
            state.cursor.x = ((count - 1) % state.view_columns);
            state.cursor.y += Math.ceil(count / state.view_columns);
        } else if (state.cursor.y > sy) {
            state.cursor.y += (y - sy);
        }

        if (state.y_offset == sy && y_offset_decremented == inc) {
            state.y_offset = orig_y_offset;
        }
    }
}

export function terminal_init_rows(state: TerminalRendererState) {
    // init rows
    state.rows = new Array<TerminalRendererCell[]>(state.view_rows);
    // fill container with rows
    for (let i = 0; i < state.view_rows; i++) {
        // duplicate state
        state.rows[i] = new Array<TerminalRendererCell>(state.view_columns);
        for (let j = 0; j < state.view_columns; j++) {
            // duplicate state
            state.rows[i][j] = { fg: state.color_fg, bg: state.color_bg, byte: 0 }
        }
    }
}