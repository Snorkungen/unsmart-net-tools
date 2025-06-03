import { uint8_concat, uint8_fromString } from "../../binary/uint8-array";
import { CSI, ASCIICodes, TERMINAL_DEFAULT_COLUMNS } from "../../terminal/shared";
import { Process, Program } from "../device";

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