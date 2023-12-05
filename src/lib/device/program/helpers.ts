import { uint8_concat, uint8_fromString } from "../../binary/uint8-array";
import { CSI, ASCIICodes } from "../../terminal/shared";

export const COLS = 8 * 8; // this is hacky i should come up with a system of getting the terminal size
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

        chunks[ci++] = str.substring(0, chunkEnd);
        str = str.substring(1 + chunkEnd); // disappear a space char
    }
    return chunks;
}

export function leftOffsetStr(str: string, offset: number, cols = COLS): Uint8Array {
    let chunkSize = cols - offset;
    let chunks = chunkString(str, chunkSize);

    // join chunks
    let moveBuf = CSI(
        ...uint8_fromString((offset).toString()),
        ASCIICodes.G
    )
    let bufs: Uint8Array[] = [];

    if (chunks.length == 1) {
        return uint8_concat ([
            moveBuf, uint8_fromString(chunks[chunks.length - 1] + "\n") // This is garbage
        ])
    }

    for (let ci = 0; ci < chunks.length - 1; ci++) {
        bufs.push(uint8_fromString(chunks[ci] + "\n"), moveBuf)
    }

    bufs.push(uint8_fromString(chunks[chunks.length - 1] + "\n")); // last chunk

    return uint8_concat(bufs)
}

export function parseArgs(args: string): string[] {
    let argv: string[] = [];

    let p = 0, i = 0, c: string;
    while (p < args.length) {
        c = args[p];

        if (c == '"') {
            p++
            while (p < args.length) {
                c = args[p];

                if (c == '"') {
                    p++;
                    break;
                } else if (c) {
                    argv[i] ? argv[i] += c : argv[i] = c;
                }
                p++;
            }
            continue;
        } else if (c == " ") {
            i++;
        } else {
            argv[i] ? argv[i] += c : argv[i] = c;
        }

        p++;
    }

    return argv;
}

/** source <https://stackoverflow.com/a/44646838> */
export function getLengthOfLongestElement(arr: { length: number }[]) {
    return Math.max(0, ...arr.map(s => s?.length || 0));
}

export function formatTable(table: string[][], joiner = "\t"): string {
    let lengths: number[] = []

    for (let i = 0; i < getLengthOfLongestElement(table); i++) {
        lengths[i] = getLengthOfLongestElement(
            table.map(r => r[i])
        );
    }

    return table.map((row) => (
        row.map((s, i) => (s || "").padEnd(lengths[i], " ")).join(joiner)
    )).join("\n");
}

// export function resolveTTYProgram(root: TTYProgram | undefined, args: string, depth = 0): TTYProgram | undefined {
//     if (typeof root != "function") return undefined;

//     if (!root.sub) return root;

//     let [, key] = parseArgs(args).slice(depth);

//     if (typeof root.sub[key] != "function") return root;

//     return resolveTTYProgram(root.sub[key], args, depth + 1)
// }

// export function createTTYProgram(init: TTYProgramInitializer, md: TTYProgramMetaData): TTYProgram {
//     return Object.assign(init, md);
// }