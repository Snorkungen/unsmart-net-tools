import { BaseAddress } from "../../address/base";
import { IPV4Address } from "../../address/ipv4";
import { IPV6Address } from "../../address/ipv6";
import { AddressMask, createMask } from "../../address/mask";
import { uint8_equals, uint8_fromString, uint8_readUint32BE } from "../../binary/uint8-array";
import { Program, ProcessSignal, Process, DeviceRoute } from "../device";
import { NETWORK_SWITCH_STORE_KEY, NetworkSwitchData } from "../network-switch";
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

        if (!proc.device.store_get(NETWORK_SWITCH_STORE_KEY)) {
            return ProcessSignal.EXIT;
        }

        // Print information about mac address table;
        let data = proc.device.store_get(NETWORK_SWITCH_STORE_KEY) as NetworkSwitchData;

        table = [["Destination", "Iface"]]; // reset table
        for (let { destination, outgoing_port } of data.macaddresses) {
            table.push([destination.toString(), data.ports[outgoing_port].iface.id()])
        }

        proc.term_write(uint8_fromString("\nMac Adresses\n"));
        proc.term_write(formatTable(table))

        return ProcessSignal.EXIT;
    },
    __NODATA__: true
}

const DEVICE_PROGRAM_ROUTEINFO_REMOVE: Program = {
    name: "remove",
    description: "remove a entry from routes",
    content: "!TODO: write usage instructions",
    init(proc, args) {
        let [, , arg_destination, ifid,] = args;

        if (!arg_destination) {
            proc.term_write(uint8_fromString(`Destination: missing\n${this.content}`));
            return ProcessSignal.ERROR;
        }

        let destination: BaseAddress;
        if (IPV4Address.validate(arg_destination)) {
            destination = new IPV4Address(arg_destination);
        } else if (true /* should validate ipv6 addresses, but not implemented yet */) {
            destination = new IPV6Address(arg_destination);
        }


        let predicate = (route: DeviceRoute) => {
            return uint8_equals(route.destination.buffer, destination.buffer);
        }

        // take destination and find the destination and the disambiguate the route
        // !TODO: ensure that only one route gets removed at a time
        let removed_routes = proc.device.routes.filter(predicate);
        proc.term_write(uint8_fromString(`removed ${removed_routes.length} routes\n`))
        proc.device.routes = proc.device.routes.filter(r => !predicate(r)); // just remove all destinations matching the specified destination


        return ProcessSignal.EXIT;
    },
    __NODATA__: true
}

const DEVICE_PROGRAM_ROUTEINFO_ADD4: Program = {
    name: "add4",
    description: "add ipv4 address to route entries",
    content: "USAGE:\n<routeinfo add4 [IF_ID] [destination] [netmask] [gateway]>\nEXAMPLE:\n<routeinfo add4 eth0 192.168.1.100 32 192.168.1.10>",
    init(proc, args, data) {
        // <routeinfo add4 [IF_ID] [destination] [netmask] [gateway] [...flags]
        let [, , ifid, arg_destination, arg_netmask, arg_gateway] = args

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

        let gateway: IPV4Address;
        if (IPV4Address.validate(arg_gateway)) {
            f_gateway = true
            gateway = new IPV4Address(arg_gateway)
        } else {
            gateway = new IPV4Address("0.0.0.0");
        }

        if (netmask.length === IPV4Address.ADDRESS_LENGTH) {
            f_host = true; // if netmask covers all bits, the destination is a host
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
    },
    __NODATA__: true
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
            if (route.f_gateway) flags += "G";
            if (route.f_host) flags += "H";

            return [route.destination.toString(), netmask, route.gateway.toString(), flags, route.iface.id()]
        }))

        proc.term_write(formatTable(table))

        return ProcessSignal.EXIT;
    },
    sub: [DEVICE_PROGRAM_ROUTEINFO_ARP, DEVICE_PROGRAM_ROUTEINFO_REMOVE, DEVICE_PROGRAM_ROUTEINFO_ADD4],
    __NODATA__: true
}