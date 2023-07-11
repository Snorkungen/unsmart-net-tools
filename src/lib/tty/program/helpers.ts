import { Device } from "../../device/device";
import { TTYProgram, TTYWriter } from "./program";

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


export function resolveTTYProgram(root: TTYProgram | undefined, args: string, writer: TTYWriter, device: Device, depth = 0): ReturnType<TTYProgram> | undefined {
    if (typeof root != "function") return undefined;
    let prog = root(writer, device);
    if (!prog.sub) return prog;

    let [, key] = parseArgs(args).slice(0);

    if (typeof prog.sub[key] != "function") return prog;

    return resolveTTYProgram(prog.sub[key], args, writer, device, depth + 1)
}