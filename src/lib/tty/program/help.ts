import { Device } from "../../device/device";
import { TTYProgram, TTYProgramStatus, formatTable, parseArgs } from "./program";

export function registerTTYProgramHelp(device: Device, programs: Record<string, TTYProgram>) {
    const ttyProgramHelp: TTYProgram = (writer) => {
        let cancel = () => { };
        return {
            about: {
                description: "Displays information about programs.",
                content: formatTable([
                    [],
                    ["<help>", "Displays the descriptions of all available programs."],
                    [],
                    ["<help [...program_name]>", "Displays all information available about the specified program."]
                ], " ")

            },
            cancel,
            run(args) {
                return new Promise(resolve => {
                    cancel = () => { resolve(TTYProgramStatus.CANCELED); }

                    let [, ...names] = parseArgs(args);

                    if (names.length == 0) {

                        let row = ["Program", "Description"];
                        let rows = Object.keys(programs).map(name => {
                            let desc = "";
                            let entry = programs[name];
                            if (typeof entry == "function") {
                                desc = entry(writer, device).about.description;
                            }
                            return [name, desc]
                        })

                        writer.write(
                            formatTable([row].concat(rows), "\t\t")
                        )

                    } else for (let name of names) {
                        let entry = programs[name];
                        if (typeof entry != "function") continue;
                        let prog = programs[name](writer, device);

                        // In future resolve the specified program

                        writer.write(`${name}:\t\t${prog.about.description}\n${prog.about.content}\n`)
                    }
                    resolve(TTYProgramStatus.OK)
                })
            },
        }
    }


    return ttyProgramHelp;
}