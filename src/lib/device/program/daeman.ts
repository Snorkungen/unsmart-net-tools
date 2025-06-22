import { ProcessSignal, Program } from "../device";
import { PPFactory, ProgramParameterDefinition } from "../internals/program-parameters";
import { formatTable, ioprintln } from "./helpers";

const pdef = new ProgramParameterDefinition([
    ["daeman",],
    ["daeman", PPFactory.number("PID"), PPFactory.keywords("ACTION", ["interrupt", "close"])]
])

export const DEVICE_PROGRAM_DAEMAN: Program = {
    name: "daeman",
    parameters: pdef,
    init(proc, sargs) {
        const res = pdef.parse(proc.device, sargs);

        if (!res.success) {
            ioprintln(proc.io, pdef.message(res));
            return ProcessSignal.ERROR;
        }

        const processes = proc.device.processes;
        const [, pid, action] = res.arguments;

        if (typeof pid === "number") {
            let daemon = processes.items[pid];

            if (!daemon) {
                ioprintln(proc.io, "process not found");
                return ProcessSignal.ERROR;
            }

            if (action == "close") {
                daemon.close(ProcessSignal.EXIT);
            } else if (action == "interrupt") {
                daemon.close(ProcessSignal.INTERRUPT);
            }
        }

        let table: string[][] = [["PID", "name", "status"]];
        for (let i = 0; i < processes.items.length; i++) {
            let daemon = processes.items[i];

            if (!daemon || daemon === proc) {
                continue;
            }

            table.push([i + ":", daemon.id, daemon.status]);
        }

        proc.io.write(formatTable(table));

        return ProcessSignal.EXIT;
    },
    __NODATA__: true
};
