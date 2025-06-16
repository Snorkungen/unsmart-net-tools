import { IPV4Address } from "../../address/ipv4";
import { IPV6Address } from "../../address/ipv6";
import { Program, ProcessSignal, Process, Device, _UNSET_ADDRESS_IPV4 } from "../device";
import { PPFactory, ProgramParameter, ProgramParameterDefinition } from "../internals/program-parameters";
import { NETWORK_SWITCH_STORE_KEY, NetworkSwitchData } from "../network-switch";
import { formatTable, ioprintln } from "./helpers";

function custom_destination4_parser(this: ProgramParameter<IPV4Address>, val: string, dev: Device): IPV4Address {
    if (val == "0") {
        return new IPV4Address("0.0.0.0");
    }
    return PPFactory.parse_ipv4.call(this, val, dev);
}

const PPBaseInterface = PPFactory.create("IFID", PPFactory.parse_baseiface)
const PPDestination4 = PPFactory.create("DESTINATION", custom_destination4_parser);
const PPGateway4 = PPFactory.ipv4("GATEWAY")
const PPNetmask4 = PPFactory.create("NETMASK", PPFactory.parse_amask_ip4);

const pdef = new ProgramParameterDefinition([
    ["routeinfo", PPFactory.optional(PPFactory.keywords("action", ["4", "ipv4", "6", "ipv6"])), PPFactory.optional(PPFactory.multiple(PPBaseInterface))],
    ["routeinfo", "arp", PPFactory.optional(PPFactory.multiple(PPBaseInterface))],
    ["routeinfo", "add4", PPBaseInterface, PPDestination4, PPNetmask4, PPFactory.optional(PPGateway4)],
    ["routeinfo", "remove", PPBaseInterface, PPDestination4, PPFactory.optional(PPNetmask4), PPFactory.optional(PPGateway4)],
]);

function routeinfo_arp(proc: Process, pdres: ReturnType<(typeof pdef)["parse"]>): ReturnType<Program["init"]> {
    let table: (string | undefined)[][] = [["Destination", "MACaddress", "Iface"]]

    for (let [key, entry] of proc.device.arp_cache.entries()) {
        table.push([key, entry.macAddress.toString(), entry.iface.id()])
    }

    proc.io.write(formatTable(table))

    if (!proc.device.store_get(NETWORK_SWITCH_STORE_KEY)) {
        return ProcessSignal.EXIT;
    }

    // Print information about mac address table;
    let data = proc.device.store_get(NETWORK_SWITCH_STORE_KEY) as NetworkSwitchData;

    table = [["Destination", "Iface"]]; // reset table
    for (let { destination, outgoing_port } of data.macaddresses) {
        table.push([destination.toString(), data.ports[outgoing_port].iface.id()])
    }

    ioprintln(proc.io, "");
    ioprintln(proc.io, "Network Switch: MAC adresses");
    proc.io.write(formatTable(table))

    return ProcessSignal.EXIT;
}

export const DEVICE_PROGRAM_ROUTEINFO: Program = {
    name: "routeinfo",
    description: "displays information about the device's routing information",
    parameters: pdef,
    init(proc, args) {
        const pdres = pdef.parse(proc.device, args);

        if (!pdres.success) {
            ioprintln(proc.io, pdef.message(pdres));
            return ProcessSignal.ERROR;
        }

        const [, action] = pdres.arguments;

        if (action == "arp") {
            return routeinfo_arp(proc, pdres);
        } else if (action == "add4") {
            const [, , iface, destination, netmask, gateway] = pdres.arguments;
            proc.device.interface_route_set(iface, destination, netmask, gateway || _UNSET_ADDRESS_IPV4)
            ioprintln(proc.io, "Added route.");
        } else if (action == "remove") {
            const [, , iface, destination, netmask, gateway] = pdres.arguments;
            let res = proc.device.interface_route_remove(iface, destination, netmask, gateway, true);

            if (!res.success) {
                ioprintln(proc.io, "failed to remove route: " + res.message);
                return ProcessSignal.ERROR;
            }

            ioprintln(proc.io, `route removed`);
        }

        let routes = proc.device.routes;
        if (typeof action == "string") {
            // the below checks are cursed
            if (action.includes("4")) {
                routes = routes.filter((r) => r.destination instanceof IPV4Address);
            } else if (action.includes("6")) {
                routes = routes.filter((r) => r.destination instanceof IPV6Address);
            }
        }

        let table: (string | undefined)[][] = [["Destination", "Netmask", "Gateway", "Flags", "Iface"]]
        table.push(...routes.map((route) => {
            let netmask = route.netmask.length.toString();

            if (route.destination instanceof IPV4Address) {
                netmask = route.netmask.toAddress().toString();
            } else if (route.destination instanceof IPV6Address) {
                netmask = "/" + route.netmask.length
            }

            let flags = "";
            if (route.f_gateway) flags += "G";
            if (route.f_host) flags += "H";

            return [route.destination.toString(), netmask, route.gateway.toString(), flags, route.iface.id()]
        }))

        proc.io.write(formatTable(table))

        return ProcessSignal.EXIT;
    },
    __NODATA__: true
}