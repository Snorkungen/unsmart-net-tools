// A tool to handle the host database

import type { BaseAddress } from "../../address/base";
import { uint8_fromString } from "../../binary/uint8-array";
import { Device, ProcessSignal, Program } from "../device";

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

export function getaddress_by_host(device: Device, host: string): Promise<BaseAddress[]> {
    let addresses: BaseAddress[] = [];
    let data = get_store_data(device);

    for (let i = 0; i < data.hosts.length; i++) {
        if (host != data.hosts[i]) {
            continue;
        }

        addresses.push(...data.addresses[i]);
    }

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

    data.addresses[hidx] = addresses;
    device.store_set(HOSTSINFO_STORE_KEY, data);
    return;
}

export const DEVICE_PROGRAM_HOSTSINFO: Program = {
    name: "hostsinfo",
    init: function (proc, args): ProcessSignal {
        let data = get_store_data(proc.device)

        for (let i = 0; i < data.hosts.length; i++) {
            proc.io.write(uint8_fromString("\n" + data.hosts[i]))
            for (let address of data.addresses[i]) {
                proc.io.write(uint8_fromString("\t" + address.toString()))
            }
        }

        return ProcessSignal.EXIT;
    },
    __NODATA__: true
}