
export default class Terminal {




}

type TerminalRendererCursor = {
    x: number;
    y: number;
}

export class TerminalRenderer {
    // options start
    COLUMN_WIDTH = 30;
    ROW_HEIGHT = 10;


    COLORS = [
        "#000000",
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
        this.container.style.backgroundColor = this.color(this.COLOR_BG);

        // fill container with rows
        for (let i = 0; i < this.ROW_HEIGHT; i++) {
            let row = document.createElement("div")
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

    render() {
        if (!this.container) {
            throw new Error("container missing can't render")
        }

        let i = 0;
        char_parse_loop: while (i < this.buffer.byteLength) {
            let byte = this.buffer[i];

            // INSPIRATION <https://en.wikipedia.org/wiki/ANSI_escape_code>
            switch (byte) {
                case 0x00:  i++; continue char_parse_loop;
                case 0x08: {
                    // handle backspace
                    this.cursor.x -= 1

                    let activeElement = this.container.children[this.cursor.y].children[this.cursor.x] as HTMLElement;
                    activeElement.innerHTML = this.EMPTY_CHAR
                    break;
                }
                case 0x09: {
                    // handle Tab
                    this.cursor.x += 8 - this.cursor.x % 8;
                    break;
                } case 0x0A: {
                    // handle new line
                    this.cursor.x = 0;
                    this.cursor.y += 1
                    break;
                }
                case 0x0D: {
                    // handle carriage return
                    this.cursor.x = 0;
                }
                case 0x1b: {
                    // handle escape code
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
            this.cursor.x += 1

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