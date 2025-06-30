// A tool to handle the host database

import type { BaseAddress } from "../../address/base";
import { Device, DeviceRoute, ProcessSignal, Program } from "../device";
import { device_program_register } from "../internals/program";
import { ioprint } from "./helpers";

export type HostsinfoData = {
    hosts: string[];
    addresses: BaseAddress[][];
}
export const HOSTSINFO_STORE_KEY = "__hostsdb__";

function get_store_data(device: Device): HostsinfoData {
    let data = device.store_get(HOSTSINFO_STORE_KEY) as HostsinfoData;
    if (!data) {
        data = { hosts: [], addresses: [] } as HostsinfoData
        device.store_set(HOSTSINFO_STORE_KEY, data);
    }
    return data;

}

function sort_addresses_by_routes(routes: DeviceRoute[], addresses: BaseAddress[]): BaseAddress[] {
    return addresses.sort((a, b) => {
        let a_route: DeviceRoute | undefined = undefined, b_route: DeviceRoute | undefined = undefined;
        for (let r of routes) { // caching the routes would be nice but, then again who cares about performance
            if ((!a_route || a_route.netmask.length < r.netmask.length) && r.netmask.compare(r.destination, a)) a_route = r;
            if ((!b_route || b_route.netmask.length < r.netmask.length) && r.netmask.compare(r.destination, b)) b_route = r;
        }

        if (!a_route) return -1;
        if (!b_route) return 1;

        return b_route.netmask.length - a_route.netmask.length
    })
}

export function getaddress_by_host(device: Device, host: string): Promise<BaseAddress[]> {
    let addresses: BaseAddress[] = [];
    let data = get_store_data(device);

    for (let i = 0; i < data.hosts.length; i++) {
        if (host != data.hosts[i]) {
            continue;
        }

        addresses.push(...data.addresses[i]);
    }

    addresses = sort_addresses_by_routes(device.routes, addresses);

    return new Promise(resolve => {
        resolve(addresses)
    })
}

export function setaddress_by_host(device: Device, host: string, ...addresses: BaseAddress[]) {
    let data = get_store_data(device);

    let hidx = data.hosts.indexOf(host);
    if (hidx < 0) {
        hidx = data.hosts.length;
        data.hosts[hidx] = host;
    }

    data.addresses[hidx] = sort_addresses_by_routes(device.routes, addresses);
    device.store_set(HOSTSINFO_STORE_KEY, data);
    return;
}

export const DEVICE_PROGRAM_HOSTSINFO: Program = device_program_register({
    name: "hostsinfo",
    init: function (proc, args): ProcessSignal {
        let data = get_store_data(proc.device)

        for (let i = 0; i < data.hosts.length; i++) {
            ioprint(proc.io, "\n" + data.hosts[i] + "\t" + sort_addresses_by_routes(proc.device.routes, data.addresses[i]).join(", "))
        }

        return ProcessSignal.EXIT;
    },
    __NODATA__: true
})