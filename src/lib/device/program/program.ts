import { uint8_fromString } from "../../binary/uint8-array";
import { PCAP_GLOBAL_HEADER, PCAP_MAGIC_NUMBER, PCAP_RECORD_HEADER } from "../../header/pcap";
import { ASCIICodes, CSI } from "../../terminal/shared";
import { ProcessSignal, Program } from "../device";
import { COLS, chunkString, formatTable } from "./helpers";

export const DEVICE_PROGRAM_CLEAR: Program = {
    name: "clear",
    description: "This program clears the terminal",
    content: "Example: clear",
    init(proc, args) {
        proc.term_write(CSI(ASCIICodes.Two, 74)); // clear display
        return ProcessSignal.EXIT;
    },
    __NODATA__: true
};

export const DEVICE_PROGRAM_ECHO: Program = {
    name: "echo",
    description: "This program writes to the terminal the inputed text.",
    content: `echo [...input]
Example: echo "Hello, World"
> Hello World`,
    init(proc, args) {
        let input = args.slice(1);
        proc.term_write(uint8_fromString(input.join("\n"))); // echo
        return ProcessSignal.EXIT;
    },
    __NODATA__: true
}

export const DEVICE_PROGRAM_HELP: Program = {
    name: "help",
    description: "This program displays information about the programs, on the device.",
    content: `<help> Lists all available programs.
<help [program_name]> Displays information about the specified program.
Example 1: help
Example 2: help help`,
    init(proc, argv) {
        function displayPrograms(programs: Program[]) {
            let table: (string | undefined)[][] = [
                ["Program Name", "Description"]
            ];

            for (let p of programs) {
                table.push([p.name, p.description]);
            }
            return proc.term_write(formatTable(table));
        }

        argv.shift(); // remove help name;

        if (argv.length < 1) {
            // list all programs
            displayPrograms(proc.device.programs);
            return ProcessSignal.EXIT;
        }

        let name = argv.shift();
        let prog: Program | undefined = proc.device.programs.find(p => p.name == name);
        let parents: string[] = [];
        while (argv.length > 0 && prog) {
            name = argv.shift();
            let tmp = prog;
            prog = prog.sub?.find(p => p.name == name);
            if (!prog) {
                prog = tmp;
                break;
            } else {
                parents.push(tmp.name)
            }
        }

        if (!prog) {
            proc.term_write(uint8_fromString("No program found with the name \"" + name + "\"\n"));
            displayPrograms(proc.device.programs);
            return ProcessSignal.EXIT;
        }

        let shownName = parents.length == 0 ? prog.name : parents.join(" ") + " " + prog.name;

        proc.term_write(uint8_fromString(
            shownName + "\n" +
            ((prog.description && chunkString(prog.description, COLS).join("\n") + "\n") || "") + "\n" +
            ((prog.content && chunkString(prog.content, COLS).join("\n") + "\n") || "")
        ));

        if (prog.sub) {
            displayPrograms(prog.sub)
        }

        return ProcessSignal.EXIT;
    },
    __NODATA__: true
}

const PCAP_FILE_EXTENSION = ".cap";
export const DEVICE_PROGRAM_DOWNLOAD: Program = {
    name: "download",
    description: "Download the devices packet-capture.",
    content: "<download>\n<download> [ifid]",
    init(proc, args) {
        let [, ifid] = args;
        let name = proc.device.name;
        if (ifid) {
            name = ifid;
        }

        let records = proc.device.log_select_records(ifid);
        let buffer = [PCAP_GLOBAL_HEADER.create({
            "magicNumber": PCAP_MAGIC_NUMBER,
            "versionMajor": 2,
            "versionMinor": 4,
            "thiszone": 2,
            "sigfigs": 0,
            "snaplen": 2 ** 32 - 2,
            "network": 1
        }).getBuffer()]

        for (let record of records) {
            buffer.push(
                PCAP_RECORD_HEADER.create({
                    inclLen: record.buffer.length,
                    origLen: record.buffer.length,
                    tsSec: Math.floor(record.time / 1000),
                    tsUsec: (record.time % 1000) * 1000
                }).getBuffer(),
                record.buffer
            )
        }

        let file = new File(buffer, `${name || proc.device.name}-${new Date().getTime()}${PCAP_FILE_EXTENSION}`, {
            "type": "application/cap",
        });

        proc.term_write(uint8_fromString(`Downloading: ${file.name}`));

        let anchor = document.createElement("a");
        anchor.href = URL.createObjectURL(file);
        anchor.download = file.name;

        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove()

        return ProcessSignal.EXIT;
    },
    __NODATA__: true
}