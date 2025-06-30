import { Program } from "../device";

export const ALL_REGISTERED_PROGRAMS: Program[] = [];
export function device_program_register<T>(program: Program<T>): Program<T> {
    // de-dupe only a problem when hot-reloading
    if (true) {
        if (ALL_REGISTERED_PROGRAMS.some(p => p.name === program.name)) return program;
    }
    ALL_REGISTERED_PROGRAMS.push(program);
    return program;
}