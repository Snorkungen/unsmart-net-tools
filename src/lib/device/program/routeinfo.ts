import { IPV4Address } from "../../address/ipv4";
import { IPV6Address } from "../../address/ipv6";
import { AddressMask, createMask } from "../../address/mask";
import { uint8_fromString, uint8_readUint32BE } from "../../binary/uint8-array";
import { Program, ProcessSignal, Process } from "../device";
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

const DEVICE_PROGRAM_ROUTEINFO_ADD4: Program = {
    name: "add4",
    description: "add ipv4 address to route entries",
    content: "TODO: write content for DEVICE_PROGRAM_ROUTEINFO_ADD4",
    init(proc, args, data) {
        // <routeinfo add4 [IF_ID] [destination] [netmask] [gateway] [...flags]
        let [, , ifid, arg_destination, arg_netmask, ...flags] = args

        if (!ifid) {
            proc.term_write(uint8_fromString(`IF_ID: missing\n${this.content}`));
            return ProcessSignal.ERROR;
        } else if (!arg_destination) {
            proc.term_write(uint8_fromString(`Destination: missing\n${this.content}`));
            return ProcessSignal.ERROR;
        } else if (!arg_destination) {
            proc.term_write(uint8_fromString(`Mask: missing\n${this.content}`));
            return ProcessSignal.ERROR;
        }

        let iface = proc.device.interfaces.find(iface => iface.id() == ifid);
        if (!iface) {
            proc.term_write(uint8_fromString(`IF_ID: (${ifid}) is invalid`))
            return ProcessSignal.ERROR
        }

        let destination: IPV4Address
        if (arg_destination.length == 1 && arg_destination[0] == "0") {
            destination = new IPV4Address("0.0.0.0");
        } else if (IPV4Address.validate(arg_destination)) {
            destination = new IPV4Address(arg_destination)
        } else {
            proc.term_write(uint8_fromString(`invalid address [${arg_destination}]`))
            return ProcessSignal.ERROR
        }

        let netmask: AddressMask<typeof IPV4Address> | undefined
        if (IPV4Address.validate(arg_netmask)) {
            netmask = createMask(IPV4Address, arg_netmask);
        } else {
            let n = parseInt(arg_netmask);
            if (!isNaN(n)) {
                netmask = createMask(IPV4Address, n);
            }
        }

        if (!netmask || !netmask.isValid()) {
            proc.term_write(uint8_fromString(`mask: (${arg_netmask}) is invalid`));
            return ProcessSignal.ERROR;
        }


        let f_gateway: true | undefined = undefined,
            f_dynamic: true | undefined = undefined,
            f_host: true | undefined = undefined,
            f_static = true

        let gateway: IPV4Address

        let arg_gateway = flags[0] || ""
        if (IPV4Address.validate(arg_gateway)) {
            f_gateway = true
            f_host = undefined
            gateway = new IPV4Address(arg_gateway)
            flags.shift()
        } else {
            f_host = true
            gateway = new IPV4Address("0.0.0.0");
        }

        if (uint8_readUint32BE(gateway.buffer) === 0) {
            if (netmask.length === IPV4Address.ADDRESS_LENGTH) {
                f_host = true
            } else {
                // !TODO: i can't remember what the goal is
            }
        }

        if (flags.length) {
            // !TODO: read flags
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

        proc.term_write(uint8_fromString("Added route.\n"))

        proc.device.process_spawn(proc, DEVICE_PROGRAM_ROUTEINFO, ["routeinfo", "ipv4"])

        return ProcessSignal.EXIT;
    }
}

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
            } else  if (route.f_host) {
                flags += "H"
            }

            return [route.destination.toString(), netmask, route.gateway.toString(), flags, route.iface.id()]
        }))

        proc.term_write(formatTable(table))

        return ProcessSignal.EXIT;
    },
    sub: [DEVICE_PROGRAM_ROUTEINFO_ARP, DEVICE_PROGRAM_ROUTEINFO_ADD4]
}