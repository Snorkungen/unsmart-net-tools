import { IPV4Address } from "../../address/ipv4";
import { IPV6Address } from "../../address/ipv6";
import { Program, ProcessSignal } from "../device";
import { formatTable } from "./helpers";


export const DEVICE_PROGRAM_ROUTEINFO_ARP: Program = {
    name: "arp",
    description: "displays information about the device's arp cache",
    content: `<routeinfo arp>  Lists arp information`,
    init(proc, argv) {
        let table: (string | undefined)[][] = [["Destination", "MACaddress", "Iface"]]

        for (let [key, entry] of proc.device.arp_cache.entries()) {
            table.push([key, entry.macAddress.toString(), entry.iface.id()])
        }

        proc.term_write(formatTable(table))

        return ProcessSignal.EXIT;
    },
}

// !TODO: add a route
// !TODO: remove a route

export const DEVICE_PROGRAM_ROUTEINFO: Program = {
    name: "routeinfo",
    description: "displays information about the device's routing information",
    content: `<routeinfo [address_family]>  Lists all routes`,
    init(proc, argv) {
        let [, af] = argv;
        let routes = proc.device.routes;

        if (typeof af == "string") {
            // the below checks are cursed
            if (af.includes("4")) {
                routes = routes.filter((r) => r.destination instanceof IPV4Address);
            } else if (af.includes("6")) {
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
            if (route.f_gateway) {
                flags += "G";
            }

            return [route.destination.toString(), netmask, route.gateway.toString(), flags, route.iface.id()]
        }))

        proc.term_write(formatTable(table))

        return ProcessSignal.EXIT;
    },
    sub: [DEVICE_PROGRAM_ROUTEINFO_ARP]
}