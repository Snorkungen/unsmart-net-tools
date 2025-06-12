import { IPV4Address } from "../../address/ipv4";
import { IPV6Address } from "../../address/ipv6";
import { uint8_equals, } from "../../binary/uint8-array";
import { Program, ProcessSignal, Process, DeviceRoute, Device } from "../device";
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

function routeinfo_add4(proc: Process, pdres: ReturnType<(typeof pdef)["parse"]>): ReturnType<Program["init"]> {
    if (!pdres.success || pdres.arguments[1] != "add4") return ProcessSignal.ERROR;
    let [, , iface, destination, netmask, gateway] = pdres.arguments;

    let f_gateway: true | undefined = undefined,
        f_dynamic: true | undefined = undefined,
        f_host: true | undefined = undefined,
        f_static = true

    if (netmask.length === IPV4Address.ADDRESS_LENGTH) {
        f_host = true; // if netmask covers all bits, the destination is a host
    }

    if (gateway) {
        f_gateway = true
    } else {
        gateway = new IPV4Address("0.0.0.0");
    }

    proc.device.routes.push({
        destination: destination,
        netmask: netmask,
        gateway: gateway,
        iface: iface,
        f_gateway,
        f_dynamic,
        f_host,
        f_static
    })

    ioprintln(proc.io, "Added route.");

    return ProcessSignal.EXIT;
}

function routeinfo_remove4(proc: Process, pdres: ReturnType<(typeof pdef)["parse"]>): ReturnType<Program["init"]> {
    if (!pdres.success || pdres.arguments[1] != "remove") return ProcessSignal.ERROR;
    const [, , iface, destination, netmask, gateway] = pdres.arguments;

    let predicate = (route: DeviceRoute) => {
        return uint8_equals(route.destination.buffer, destination.buffer);
    }

    // take destination and find the destination and the disambiguate the route
    // !TODO: ensure that only one route gets removed at a time
    let removed_routes = proc.device.routes.filter(predicate);
    proc.device.routes = proc.device.routes.filter(r => !predicate(r)); // just remove all destinations matching the specified destination

    ioprintln(proc.io, `removed ${removed_routes.length} routes`);

    return ProcessSignal.EXIT;
}

export const DEVICE_PROGRAM_ROUTEINFO: Program = {
    name: "routeinfo",
    description: "displays information about the device's routing information",
    content: `<routeinfo [address_family]>  Lists all routes`,
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
            let signal = routeinfo_add4(proc, pdres);
            if (signal != ProcessSignal.EXIT) {
                return signal;
            }
        } else if (action == "remove") {
            let signal = routeinfo_remove4(proc, pdres);
            if (signal != ProcessSignal.EXIT) {
                return signal;
            }
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