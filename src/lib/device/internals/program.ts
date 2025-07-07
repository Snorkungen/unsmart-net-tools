import type { Program } from "../device";

export const ALL_REGISTERED_PROGRAMS: Program[] = [];
export function device_program_register<T>(program: Program<T>): Program<T> {

    // de-dupe only a problem when hot-reloading
    if (import.meta.env.MODE == "development") {
        let i = ALL_REGISTERED_PROGRAMS.findIndex((p) => p.name == program.name);
        if (i >= 0) {
            ALL_REGISTERED_PROGRAMS[i] = program;
            return program;
        }
    }

    ALL_REGISTERED_PROGRAMS.push(program);
    return program;
}