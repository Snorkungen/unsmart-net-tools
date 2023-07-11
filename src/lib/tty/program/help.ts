import { Device } from "../../device/device";
import { TTYProgram, TTYProgramStatus, parseArgs } from "./program";

export function registerTTYProgramHelp(device: Device, programs: Record<string, TTYProgram>) {
    const ttyProgramHelp: TTYProgram = (writer) => {
        let cancel = () => { };
        return {
            about: {
                description: "Displays information about programs",
                content:
                    `
                    help
                        displays all available programs
                    help [...program_name]
                        displays information about the specified programs
                    `
            },
            cancel,
            run(args) {
                return new Promise(resolve => {
                    cancel = () => { resolve(TTYProgramStatus.CANCELED); }
                    
                    let [, ...names] = parseArgs(args);

                    if (names.length == 0) for (let key in programs) {
                        let prog = programs[key](writer, device);

                        writer.write(`${key}          ${prog.about.description}\n`)
                    } else for (let name of names) {
                        let entry = programs[name];
                        if (typeof entry != "function") continue;
                        let prog = programs[name](writer, device);

                        writer.write(`${name}:          ${prog.about.description}\n${prog.about.content}\n`)
                    }
                    resolve(TTYProgramStatus.OK)
                })
            },
        }
    }


    return ttyProgramHelp;
}