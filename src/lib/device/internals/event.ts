import type { NetworkData, Process, ProcessMessageType } from "../device";
import type { BaseInterface } from "../interface";
import type { DeviceResource } from "./resources";

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

    "interface_recv": [iface: BaseInterface, data: NetworkData];
    "interface_send": [iface: BaseInterface, data: NetworkData];
    "interface_loopback": [iface: BaseInterface, data: NetworkData];

    "process_message": [proc: Process, type: ProcessMessageType, message: string];
    "process_close": [proc: Process],
    "process_start": [proc: Process],

    "store_set": [key: string];
    "store_delete": [key: string];
};

export type DeviceEventType = keyof DeviceEventMap;
export type DeviceEventHandler<K extends DeviceEventType> = (...a: DeviceEventMap[K]) => void;
export type DeviceEventFilters<K extends DeviceEventType> = Partial<DeviceEventMap[K]>;
export type DeviceEvent<K extends DeviceEventType = DeviceEventType> = {
    keys: K[];
    handler: DeviceEventHandler<K>;
    filters: DeviceEventFilters<K>;
} & DeviceResource;