import { TTYProgram, TTYProgramInitializer, TTYProgramMetaData, TTYProgramStatus, formatTable, parseArgs, resolveTTYProgram } from "./program";


export const ttyProgramHelp: TTYProgram = Object.assign<TTYProgramInitializer, TTYProgramMetaData>((writer, dev, programs) => {
    let cancel = () => { };
    return {
        cancel,
        run(args) {
            return new Promise(resolve => {
                cancel = () => { resolve(TTYProgramStatus.CANCELED); }

                let [, ...argv] = parseArgs(args);

                if (argv.length == 0) {

                    let row = ["Program", "Description"];
                    let rows = Object.keys(programs).map(name => {
                        let desc = "";
                        let entry = programs[name];
                        if (typeof entry == "function") {
                            desc = entry.about.description;
                        }
                        return [name, desc]
                    })

                    writer.write(
                        formatTable([row].concat(rows), "\t\t")
                    )

                } else {
             
                    let entry: TTYProgram | undefined = resolveTTYProgram(programs[argv[0]], args, 1);
                    if (typeof entry != "function") return resolve(TTYProgramStatus.CANCELED);

                    writer.write(`${argv.join(" ")}:\t\t${entry.about.description}\n${entry.about.content}\n`)
                }

                resolve(TTYProgramStatus.OK)
            })
        },
    }
}, {
    about: {
        description: "Displays information about programs.",
        content: `
                <help> Displays all available programs.
                <help [program name]> Displays information about the specified program.
            `
    },
});