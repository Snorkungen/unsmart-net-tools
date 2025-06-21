import { uint8_fromString } from "../../binary/uint8-array";
import { PCAP_GLOBAL_HEADER, PCAP_MAGIC_NUMBER, PCAP_RECORD_HEADER } from "../../header/pcap";
import { ASCIICodes, CSI, TERMINAL_DEFAULT_COLUMNS } from "../../terminal/shared";
import { ProcessSignal, Program } from "../device";
import { ppbind, PPFactory, ProgramParameterDefinition } from "../internals/program-parameters";
import { DAEMON_EVENT_OBSERVER_FRAMES_STORE_KEY, Event_Observer_Frames } from "./event-observer";
import { formatTable, ioprint, ioprintln } from "./helpers";
import { termquery } from "./termquery";

export const DEVICE_PROGRAM_CLEAR: Program = {
    name: "clear",
    description: "This program clears the terminal",
    parameters: new ProgramParameterDefinition([["clear"]]),
    init(proc, args) {
        proc.io.write(CSI(ASCIICodes.Two, 74)); // clear display
        return ProcessSignal.EXIT;
    },
    __NODATA__: true
};

export const DEVICE_PROGRAM_ECHO: Program = {
    name: "echo",
    description: "This program writes to the terminal the inputed text.",
    parameters: new ProgramParameterDefinition([["echo", PPFactory.optional(PPFactory.multiple(PPFactory.value("input")))]]),
    init(proc, args) {
        args.shift()
        for (let arg of args) {
            ioprintln(proc.io, arg)
        }
        return ProcessSignal.EXIT;
    },
    __NODATA__: true
}

const help_pdef = new ProgramParameterDefinition([
    ppbind(["help"],
        "List all available programs."),
    ppbind(["help", PPFactory.value("PROGRAM"), PPFactory.optional(PPFactory.multiple(PPFactory.value("PARAMETER")))],
        "Display information about the specified program.")
]);

export const DEVICE_PROGRAM_HELP: Program = {
    name: "help",
    description: "This program displays information about the programs, on the device.",
    parameters: help_pdef,
    async init(proc, args) {
        let columns = (await termquery(proc)).width || TERMINAL_DEFAULT_COLUMNS;

        const res = help_pdef.parse(proc.device, args);
        if (!res.success) return ProcessSignal.ERROR;

        const [, program_name, parameters] = res.arguments;
        const program = proc.device.programs.find(({ name }) => name == program_name);

        if (program_name && !program) {
            ioprintln(proc.io, `No program with the name "${program_name}"`);
        }

        if (!program) { // list all programs
            let table: (string | undefined)[][] = [
                ["Program Name", "Description"]
            ];

            for (let p of proc.device.programs) {
                table.push([p.name, p.description]);
            }
            proc.io.write(formatTable(table, columns));
            return ProcessSignal.EXIT;
        }

        if (program.parameters) {
            // !TODO: do better
            let content = program.parameters.content().map(([command, desc]) => {
                let res = `<${command}>`
                if (desc) {
                    res += " -- " + desc
                }
                return res;
            }).join("\n");
            ioprint(proc.io, content);
        } else {
            ioprint(proc.io, program.name);
        }

        return ProcessSignal.EXIT;
    },
    __NODATA__: true
}

const download_pdef = new ProgramParameterDefinition([
    ["download", PPFactory.optional(PPFactory.create("IFID", PPFactory.parse_baseiface))]
]);

const PCAP_FILE_EXTENSION = ".cap";
export const DEVICE_PROGRAM_DOWNLOAD: Program = {
    name: "download",
    description: "Download the devices packet-capture.",
    parameters: download_pdef,
    init(proc, args) {
        let [, ifid] = args;
        let name = proc.device.name;
        if (ifid) {
            name = ifid;
        }

        let records = proc.device.store_get<Event_Observer_Frames>(DAEMON_EVENT_OBSERVER_FRAMES_STORE_KEY) ?? [];
        if (ifid) {
            records = records.filter(({ iface }) => iface.id() === ifid)
        }

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

        proc.io.write(uint8_fromString(`Downloading: ${file.name}`));

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