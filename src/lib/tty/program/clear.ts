import { TTYProgram, TTYProgramStatus, parseArgs } from "./program";


let cancel = () => { };
export const ttyProgramClear: TTYProgram = writer => ({
    about: {
        description: "clear the tty",
        content: `
                clear
                `
    },
    cancel,
    run(args) {
        return new Promise(resolve => {
            cancel = () => { resolve(TTYProgramStatus.CANCELED) };
            writer.clear()
            resolve(TTYProgramStatus.OK)
        })
    }
})