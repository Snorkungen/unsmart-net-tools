import { IPV4Address } from "../../address/ipv4";
import { IPV6Address } from "../../address/ipv6";
import { createMask } from "../../address/mask";
import { NEIGHBOR_DISCOVERY_ERROR } from "../neighbor-table";
import { NeighborEntry } from "../neighbor-table";
import { Device } from "../device";

export async function resolveSendingInformationVersion4(host: Device, address: IPV4Address): Promise<NeighborEntry<IPV4Address>> {
    // check if inside subnet   
    for (let opt of host.interfaces) {
        if (!opt.ipv4Address || !opt.ipv4SubnetMask) {
            continue;
        }

        if (opt.ipv4Address.toString() == address.toString()) {
            // return if the destination is itself
            return {
                neighbor: address,
                iface: opt,
                macAddress: opt.macAddress,
                createdAt: -1
            }
        }

        if (opt.ipv4SubnetMask.compare(opt.ipv4Address, address)) {
            // interface address is in the same subnet

            let entry = await host.neighborTable.getDiscover(address)

            if (typeof entry == "number") {
                throw new Error("neighbor discover error: " + (entry == NEIGHBOR_DISCOVERY_ERROR.TIMEOUT ? "TIMEOUT" : entry));
            } else {
                return entry as NeighborEntry<IPV4Address>;
            }
        }
    }

    // This is Hacky this function is not even in use with other developments
    // But This is just testing for my EGO


    // get first interface with a gateway

    let iface = host.interfaces.find(({ ipv4GW }) => !!ipv4GW);
    if (iface && iface.ipv4GW) {
        // get info for gateway
        return await resolveSendingInformationVersion4(host, iface.ipv4GW)
    }

    throw new Error("Default gateway logic not implemented")
}

export async function resolveSendingInformationVersion6(host: Device, address: IPV6Address): Promise<NeighborEntry<IPV6Address>> {
    for (let iface of host.interfaces) {
        if (!iface.ipv6Address || !iface.prefixLength) {
            continue;
        }

        if (iface.ipv6Address.toString() == address.toString()) {
            // return if the destination is itself
            return {
                neighbor: address,
                iface,
                macAddress: iface.macAddress,
                createdAt: -1
            }
        }

        // check if address is in the same subnet as iface address
        let mask = createMask(IPV6Address, iface.prefixLength)
        if (mask.compare(address, iface.ipv6Address)) {
            let entry = await host.neighborTable.getDiscover(address)

            if (typeof entry == "number") {
                throw new Error("neighbor discover error: " + (entry == NEIGHBOR_DISCOVERY_ERROR.TIMEOUT ? "TIMEOUT" : entry));
            } else {
                return entry as NeighborEntry<IPV6Address>;
            }
        }
    }

    throw new Error("Default gateway logic not implemented")
}
export default async function resolveSendingInformation(device: Device, address: IPV4Address | IPV6Address): Promise<NeighborEntry<typeof address>> {
    if (address instanceof IPV4Address) {
        return resolveSendingInformationVersion4(device, address);
    } else if (address instanceof IPV6Address) {
        return resolveSendingInformationVersion6(device, address);
    }

    throw new Error("Cannot Resolve Sending Information")
}