import { Device } from "../../device/device";
import { ttyProgramClear } from "./clear";
import { ttyProgramEcho } from "./echo";
import { ttyProgramHelp } from "./help";
import { ttyProgramIfinfo } from "./ifinfo";
import { ttyProgramPing } from "./ping";

export * from "./helpers"

export type TTYPrograms = {
    help: TTYProgram;
    echo: TTYProgram;
    clear: TTYProgram;
} & Record<string, TTYProgram>;

export enum TTYProgramStatus {
    OK,
    ERROR,
    CANCELED
}

export type TTYProgramAbout = {
    description: string;
    content: string;
}

export type TTYProgram = TTYProgramMetaData & TTYProgramInitializer;

export type TTYProgramInitializer = (writer: TTYWriter, device: Device, programs: TTYPrograms) => {
    cancel(): void;
    run(args: string): Promise<TTYProgramStatus>;
}

export type TTYProgramMetaData = {
    about: TTYProgramAbout;
    sub?: Record<string, TTYProgram>;
}

export type TTYWriter = {
    write(text: string): void;
    clear(): void;
    clearLine(): void;
}

export function registerTTYPrograms(): TTYPrograms {
    const programs: TTYPrograms = {
        help: ttyProgramHelp,
        echo: ttyProgramEcho,
        clear: ttyProgramClear,
    };

    programs["ifinfo"] = ttyProgramIfinfo;
    programs["ping"] = ttyProgramPing;
    return programs;
};
