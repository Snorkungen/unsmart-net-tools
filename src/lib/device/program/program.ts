import { uint8_concat, uint8_fromString } from "../../binary/uint8-array";
import { ASCIICodes, CSI } from "../../terminal/shared";
import { DeviceProgram, DeviceProgramOptions, DeviceProgramStatus } from "../device-program";
import { COLS, getLengthOfLongestElement, parseArgs, TAB_SIZE, chunkString, tabAlign, formatTable } from "./helpers";

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
        function displayPrograms(programs: DeviceProgram[]) {
            // List all programs
            let table: (string | undefined)[][] = [
                ["Program Name", "Description"]
            ];

            for (let p of programs) {
                table.push([p.name, p.description])
            }

            return options.terminal.write(formatTable(table))
        }

        return new Promise<DeviceProgramStatus>((resolve) => {
            let [, ...argv] = parseArgs(args);

            if (argv.length < 1) {
                // List all programs
                displayPrograms(options.device.programs);
            } else {
                let name = argv.shift();
                let prog: DeviceProgram | undefined = options.device.programs.find(p => p.name == name);
                let parents: string[] = []
                while (argv.length > 0 && prog) {
                    let name = argv.shift();

                    let tmp = prog;
                    prog = prog?.sub?.find((p) => name == p.name)
                    if (!prog) {
                        prog = tmp;
                        break;
                    } else {
                        parents.push(tmp.name)
                    }
                }
                if (prog) {
                    let shownName = parents.length == 0 ? prog.name : parents.join(" ") + " " + prog.name;

                    options.terminal.write(uint8_fromString(
                        shownName + "\n" +
                        ((prog.description && chunkString(prog.description, COLS).join("\n") + "\n") || "") + "\n" +
                        ((prog.content && chunkString(prog.content, COLS).join("\n") + "\n") || "")
                    ))

                    if (prog.sub) {
                        displayPrograms(prog.sub)
                    }
                } else {
                    options.terminal.write(uint8_fromString("No program found with the name \"" + args.substring(this.name.length + 1) + "\"\n"));
                    displayPrograms(options.device.programs); 
                }
            }

            resolve(DeviceProgramStatus.OK)
        })
    }
}

const PCAP_FILE_EXTENSION = ".cap"
export const DEVICE_PROGRAM_DOWNLOAD: DeviceProgram = {
    name: "download",
    description: "Download the devices packet-capture.",
    content: "<download>\n<donwload> [name]",
    run: function (args: string, { device, terminal }: DeviceProgramOptions): Promise<DeviceProgramStatus> {
        return new Promise((resolve) => {
            let [, name] = parseArgs(args);

            if (name && name.substring(name.length - PCAP_FILE_EXTENSION.length) != PCAP_FILE_EXTENSION) {
                name += PCAP_FILE_EXTENSION
            }

            let file = device.createCaptureFile(name);

            if (!file) {
                terminal.write(uint8_fromString("Nothing to download."));
                return resolve(DeviceProgramStatus.ERROR);
            }

            terminal.write(uint8_fromString(`Downloading: ${file.name}`));

            let anchor = document.createElement("a");
            anchor.href = URL.createObjectURL(file);
            anchor.download = file.name;

            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove()

            resolve(DeviceProgramStatus.OK);
        })
    },
}