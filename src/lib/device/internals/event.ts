import type { BaseInterface } from "../interface";
import { DeviceResource } from "./resources";

type DeviceEventMap = {
    "interface_add": [];
    "interface_remove": [];

    "interface_address_set": [iface: BaseInterface];
    "interface_address_remove": [iface: BaseInterface];
    "interface_route_set": [iface: BaseInterface]
    "interface_route_remove": [iface: BaseInterface]
    "interface_mcast_subscribe": [iface: BaseInterface];
    "interface_mcast_unsubscribe": [iface: BaseInterface];
    "interface_disconnect": [iface: BaseInterface];
    "interface_connect": [iface: BaseInterface];
    "interface_recv": [iface: BaseInterface];
    "interface_send": [iface: BaseInterface];

    "store_set": [key: string];
    "store_delete": [key: string];
};

export type DeviceEventType = keyof DeviceEventMap;
export type DeviceEventHandler<K extends DeviceEventType> = (...a: DeviceEventMap[K]) => void;
export type DeviceEvent<T extends DeviceEventType = DeviceEventType> = {
    keys: T[];
    handler: DeviceEventHandler<T>;
} & DeviceResource;