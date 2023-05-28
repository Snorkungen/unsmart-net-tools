import { BitArray } from "../../binary";
import { AddressV4 } from "../../ip/v4";
import { AddressV6 } from "../../ip/v6";
import { Host } from "./host";
import { NEIGHBOR_DISCOVERY_ERROR } from "./neighbor-table";
import { NeighborEntry } from "./neighbor-table";

export async function resolveSendingInformationVersion4(host: Host, address: AddressV4): Promise<NeighborEntry<AddressV4>> {
    // check if inside subnet   
    for (let opt of host.interfaces) {
        if (!opt.ipAddressV4 || !opt.subnetMaskV4) {
            continue;
        }

        if (opt.ipAddressV4.toString() == address.toString()) {
            // return if the destination is itself
            return {
                neighbor: address,
                iface: opt,
                macAddress: opt.macAddress,
                createdAt: -1
            }
        }

        if (address.bits.and(opt.subnetMaskV4.bits).toNumber() == opt.ipAddressV4.bits.and(opt.subnetMaskV4.bits).toNumber()) {
            // interface address is in the same subnet

            let entry = await host.neighborTable.getDiscover(address)

            if (typeof entry == "number") {
                throw new Error("neighbor discover error: " + (entry == NEIGHBOR_DISCOVERY_ERROR.TIMEOUT ? "TIMEOUT" : entry));
            } else {
                return entry as NeighborEntry<AddressV4>;
            }
        }
    }

    throw new Error("Default gateway logic not implemented")
}

export async function resolveSendingInformationVersion6(host: Host, address: AddressV6): Promise<NeighborEntry<AddressV6>> {
    for (let iface of host.interfaces) {
        if (!iface.ipAddressV6 || !iface.prefixLength) {
            continue;
        }

        if (iface.ipAddressV6.toString() == address.toString()) {
            // return if the destination is itself
            return {
                neighbor: address,
                iface,
                macAddress: iface.macAddress,
                createdAt: -1
            }
        }

        // check if address is in the same subnet as iface address
        let mask = new BitArray(1, AddressV6.address_length).and(new BitArray(0, iface.prefixLength));
        if (address.bits.and(mask).toNumber() == iface.ipAddressV6.bits.and(mask).toNumber()) {
            let entry = await host.neighborTable.getDiscover(address)

            if (typeof entry == "number") {
                throw new Error("neighbor discover error: " + (entry == NEIGHBOR_DISCOVERY_ERROR.TIMEOUT ? "TIMEOUT" : entry));
            } else {
                return entry as NeighborEntry<AddressV6>;
            }
        }
    }

    throw new Error("Default gateway logic not implemented")
}
export default async function resolveSendingInformation(device: Host, address: AddressV4 | AddressV6): Promise<NeighborEntry> {
    if (address instanceof AddressV4) {
        return resolveSendingInformationVersion4(device, address);
    } else if (address instanceof AddressV6) {
        return resolveSendingInformationVersion6(device, address);
    }

    throw new Error("Cannot Resolve Sending Information")
}