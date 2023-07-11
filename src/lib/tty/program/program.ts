import { Device } from "../../device/device";
import { ttyProgramClear } from "./clear";
import { ttyProgramEcho } from "./echo";
import { registerTTYProgramHelp } from "./help";
import { ttyProgramIfinfo } from "./ifinfo";

export * from "./helpers"

export enum TTYProgramStatus {
    OK,
    ERROR,
    CANCELED
}

export type TTYProgramAbout = {
    description: string;
    content: string;
}

export interface TTYProgram {
    (writer: TTYWriter, device: Device): {
        about: TTYProgramAbout;
        cancel(): void;
        run(args: string): Promise<TTYProgramStatus>;
        sub?: Record<string, TTYProgram>
    }
}

export type TTYWriter = {
    write(text: string): void;
    clear(): void;
    clearLine(): void;
}

export function registerTTYPrograms(device: Device): Record<string, TTYProgram> {
    const programs: Record<string, TTYProgram> = {};

    programs["help"] = registerTTYProgramHelp(device, programs);
    programs["echo"] = ttyProgramEcho;
    programs["clear"] = ttyProgramClear;

    programs["ifinfo"] = ttyProgramIfinfo;

    return programs;
};

