import { BaseAddress } from "../address/base";
import { AddressMask } from "../address/mask";
import { Interface } from "./interface";

export enum DeviceRouteFlag {
    UP = 0x01,
    GATEWAY = 0x02,
    HOST = 0x04,

}

export type DeviceRoute<AddrType extends typeof BaseAddress = typeof BaseAddress> = {
    destination: InstanceType<AddrType>;
    netmask: AddressMask<AddrType>;
    gateway: InstanceType<AddrType>;

    flags: DeviceRouteFlag[];

    iface: Interface;
}
