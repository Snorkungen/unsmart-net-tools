import { getKeyByValue } from "../../misc";
import { ProcessSignal, Program } from "../device";
import { device_program_register } from "../internals/program";
import { PPFactory, ProgramParameterDefinition } from "../internals/program-parameters";
import { NETWORK_SWITCH_PORTS_STORE_KEY, NetworkSwitchPorts, NetworkSwitchPortState } from "../network-switch";
import { formatTable, ioprintln } from "./helpers";
import { DAEMON_STP_SERVER, DAEMON_STP_SERVER_STATE_STORE_KEY, storev_stp_state } from "./stp-server";

const pdef = new ProgramParameterDefinition([
    ["swportinfo"],
    ["swportinfo", "stp", PPFactory.keywords("action", ["start", "stop"])],
    // update port somehow
])

export const DEVICE_PROGRAM_SWPORTINFO: Program = device_program_register({
    name: "swportinfo",
    parameters: pdef,
    init(proc, args) {
        const pres = pdef.parse(proc.device, args);
        if (!pres.success) {
            ioprintln(proc.io, pdef.message(pres));
            return ProcessSignal.ERROR;
        }

        const ports = proc.device.store_get<NetworkSwitchPorts>(NETWORK_SWITCH_PORTS_STORE_KEY);
        if (!ports) {
            ioprintln(proc.io, "device must be configured as a NetworkSwitch")
            return ProcessSignal.ERROR;
        }

        const argv = pres.arguments;

        if (argv[1] == "stp") {
            const action = argv[2];

            if (action == "start") {
                proc.device.process_start(DAEMON_STP_SERVER);
            } else {
                // find the thing and stop it 
                for (let p of proc.device.processes.items) {
                    if (!p || p.program !== DAEMON_STP_SERVER) {
                        continue;
                    }
                    p.close();
                }
            }
        }

        let table: string[][];
        // how  should the dat be displayed

        const state = proc.device.store_get(DAEMON_STP_SERVER_STATE_STORE_KEY);
        if (state && storev_stp_state.validate(state)) {
            table = [];
            for (let key in state) {
                table.push([key, state[key as keyof typeof state] + ""])
            }

            proc.io.write(formatTable(table));
            ioprintln(proc.io, "")
        };

        table = [["port", "iface", "state"]];

        for (let key in ports) {
            let port = ports[key];
            table.push(
                [port.port_no.toString(), port.iface.id(), getKeyByValue(NetworkSwitchPortState, port.state)]
            )
        }
        proc.io.write(formatTable(table));

        return ProcessSignal.EXIT;
    }
})