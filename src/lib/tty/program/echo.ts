import { TTYProgram, TTYProgramStatus, parseArgs } from "./program";


let cancel = () => { };
export const ttyProgramEcho: TTYProgram = writer => ({
    about: {
        description: "echoes the given input",
        content: `
                echo [...input]
                `
    },
    cancel,
    run(args) {
        return new Promise(resolve => {
            cancel = () => { resolve(TTYProgramStatus.CANCELED) };

            let input = parseArgs(args).slice(1);

            writer.write(input.join("\n"))

            resolve(TTYProgramStatus.OK)
        })
    }
})