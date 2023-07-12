import { TTYProgram, TTYProgramStatus, createTTYProgram, parseArgs } from "./program";


let cancel = () => { };
export const ttyProgramClear: TTYProgram = createTTYProgram(writer => ({
    cancel,
    run(args) {
        return new Promise(resolve => {
            cancel = () => { resolve(TTYProgramStatus.CANCELED) };
            writer.clear()
            resolve(TTYProgramStatus.OK)
        })
    }
}), {
    about: {
        description: "clear the tty",
        content: `
                clear
                `
    },
})