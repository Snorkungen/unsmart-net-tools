import { assert, describe, expect, test } from "vitest"
import { terminal_resize, TerminalRendererCell, TerminalRendererState } from "../../lib/terminal/renderer"

describe("TerminalRenderer", () => {
    const state: TerminalRendererState = {
        view_columns: 0,
        view_rows: 0,
        view_modified: false,
        modified_cells: {},
        DEFAULT_COLOR_BG: 0,
        DEFAULT_COLOR_FG: 0,
        color_bg: 0,
        color_fg: 0,
        cursor: {
            x: 0,
            y: 0
        },
        prev_cursor: {
            x: 0,
            y: 0
        },
        y_offset: 0,
        rows: [],
        resize_markers: []
    }

    // setup state
    state.view_columns = 4;
    state.view_rows = 2;

    // init rows
    state.rows = new Array<TerminalRendererCell[]>(state.view_rows);

    // fill container with rows
    for (let i = 0; i < state.view_rows; i++) {
        // duplicate state
        state.rows[i] = new Array<TerminalRendererCell>(state.view_columns);
        for (let j = 0; j < state.view_columns; j++) {
            // duplicate state
            state.rows[i][j] = { fg: state.color_fg, bg: state.color_bg, byte: j }
        }
    }

    test("resize terminal rows", () => {
        state.view_columns = 6;
        terminal_resize(state);
        state.view_columns = 2;
        terminal_resize(state);

        expect(state.rows.length).toBe(4);
        for (let row of state.rows) {
            expect(row.length).toBe(state.view_columns)
        }

        expect(state.resize_markers.filter(v => Boolean(v)).length).toBe(2);
    })

    test("resize terminal cursor tracks #1", () => {
        state.view_columns = 4;
        terminal_resize(state);

        state.cursor.x = 3;
        state.cursor.y = 1;

        state.view_columns = 3;
        terminal_resize(state);

        expect(state.cursor.x).toBe(0);
        expect(state.cursor.y).toBe(3);
    });


    test("resize terminal cursor tracks #2", () => {

        state.cursor = { x: 0, y: 0 };
        state.view_columns = 3;
        terminal_resize(state);

        state.cursor.x = 0;
        state.cursor.y = 3;

        state.view_columns = 4;
        terminal_resize(state);

        expect(state.cursor.x).toBe(3);
        expect(state.cursor.y).toBe(1);
    });

    test("resize terminal cursor tracks #3", () => {
        state.cursor = { x: 0, y: 0 };
        state.view_columns = 6;
        terminal_resize(state);

        state.cursor.x = 5;
        state.cursor.y = 0;

        state.view_columns = 4;
        terminal_resize(state);

        expect(state.cursor, "").toBe({ x: 1, y: 1 })
        expect(state.rows.length).toBe(3);

    });

    test("resize terminal y_offset tracks #1", () => {
        throw new Error("test not implemented")
    });
})