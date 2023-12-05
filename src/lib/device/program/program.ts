import { uint8_fromString } from "../../binary/uint8-array";
import { ASCIICodes, CSI } from "../../terminal/shared";
import { DeviceProgram, DeviceProgramStatus } from "../device-program";
import { getLengthOfLongestElement, parseArgs } from "./helpers";

export const DEVICE_PROGRAM_CLEAR: DeviceProgram = {
    name: "clear",
    description: "This program clears the terminal.",
    content: `Example: clear`,
    run(args, options) {
        return new Promise((resolve) => {

            options.terminal.write(CSI(ASCIICodes.Two, 74)); // clear display
            return resolve(DeviceProgramStatus.OK);
        })
    },
}

export const DEVICE_PROGRAM_ECHO: DeviceProgram = {
    name: "echo",
    description: "This program writes to the terminal the inputed text.",
    content: `echo [...input]
Example: echo "Hello, World"
> Hello World`,
    run(args: string, options): Promise<DeviceProgramStatus> {
        return new Promise<DeviceProgramStatus>((resolve) => {
            let input = parseArgs(args).slice(1);
            options.terminal.write(uint8_fromString(input.join("\n"))); // echo
            resolve(DeviceProgramStatus.OK)
        })
    }
}

export const DEVICE_PROGRAM_HELP: DeviceProgram = {
    name: "help",
    description: "This program displays information about the programs, on the device.",
    content: `<help> Lists all available programs.
<help [program_name]> Displays information about the specified program.
Example 1: help
Example 2: help help`,
    run(args, options): Promise<DeviceProgramStatus> {

        let cols = 8 * 8; // this is hacky i should come up with a system of getting the terminal size
        let tabSize = 8;

        function stringChunker(
            str: string,
            chunkSize: number,
            minChunkSize: number = 12
        ): string[] {
            let chunks: string[] = new Array(Math.ceil(str.length / chunkSize));
            let ci = 0;

            // smarter chunking
            while (str.length > 0) {
                let chunkEnd = Math.min(str.length - 1, chunkSize);

                if (str.length - 1 < chunkSize) {
                    chunks[ci++] = str;
                    break;
                }

                // looks for the first space
                while (chunkEnd > minChunkSize) {
                    if (str[chunkEnd] == " ") {
                        break;
                    }
                    chunkEnd--;
                }

                chunks[ci++] = str.substring(0, chunkEnd);
                str = str.substring(1 + chunkEnd); // disappear a space char
            }
            return chunks;
        }

        function displayPrograms(programs: DeviceProgram[]) {
            // List all programs

            let names: string[] = ["Program Name"];
            let descriptions: string[] = ["Description"];
            for (let p of programs) {
                names.push(p.name);
                descriptions.push(p.description || "")
            }

            let minNameLength = getLengthOfLongestElement(names);
            // Above min NameLegth + tab char
            for (let i = 0; i < programs.length + 1; i++) {
                let name = names[i], description = descriptions[i];

                name = name.padEnd(minNameLength - name.length);

                // hacky format description with padding

                let nameColSizeOffset = (minNameLength + (minNameLength % tabSize));
                if ((description.length + nameColSizeOffset) > cols) {
                    let chunkSize = cols - nameColSizeOffset;
                    let chunks: string[] = stringChunker(description, chunkSize)

                    description = chunks.join(
                        "\n".padEnd(nameColSizeOffset + 1, " ")
                    )
                }

                options.terminal.write(uint8_fromString(
                    name + "\t" + description + "\n"
                ))

            }
        }

        return new Promise<DeviceProgramStatus>((resolve) => {
            let [, ...argv] = parseArgs(args);

            if (argv.length < 1) {
                // List all programs
                displayPrograms(options.device.programs);
            } else {
                let prog: DeviceProgram | undefined = options.device.programs.find(p => p.name == argv.shift());

                while (argv.length > 0) {
                    let name = argv.shift();

                    prog = prog?.sub?.find((p) => name == p.name)
                }

                if (prog) {
                    options.terminal.write(uint8_fromString(
                        prog.name + "\n" +
                        ((prog.description && stringChunker(prog.description, cols).join("\n") + "\n") || "") + "\n" +
                        ((prog.content && stringChunker(prog.content, cols).join("\n") + "\n") || "")
                    ))

                    if (prog.sub) {
                        console.log(prog.sub)
                        displayPrograms(prog.sub)
                    }
                }
            }

            resolve(DeviceProgramStatus.OK)
        })
    }
}
