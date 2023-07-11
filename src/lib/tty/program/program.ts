import { Device } from "../../device/device";
import { ttyProgramEcho } from "./echo";
import { registerTTYProgramHelp } from "./help";

export enum TTYProgramStatus {
    OK,
    ERROR,
    CANCELED
}

export type TTYProgramAbout = {
    description: string;
    content: string;
}

export type TTYProgram = (writer: TTYWriter, device: Device) => {
    about: TTYProgramAbout;
    cancel(): void;
    run(args: string): Promise<TTYProgramStatus>;
}

export type TTYWriter = {
    write(text: string): void;
}

export function registerTTYPrograms(device: Device): Record<string, TTYProgram> {
    const programs: Record<string, TTYProgram> = {};

    programs["help"] = registerTTYProgramHelp(device, programs);
    programs["echo"] = ttyProgramEcho;
    
    return programs;
};

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
