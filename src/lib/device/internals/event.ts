import type { BaseInterface } from "../interface";

type DeviceEventMap = {
    "interface_add": [];
    "interface_remove": [];
    "interface_set_address": [];
    "interface_mcast_subscribe": [];
    "interface_mcast_unsubscribe": [];

    "interface_disconnect": [iface: BaseInterface];
    "interface_connect": [iface: BaseInterface];
    "interface_recv": [iface: BaseInterface];
    "interface_send": [iface: BaseInterface];

    "store_set": [key: string];
    "store_delete": [key: string];
};

export type DeviceEventType = keyof DeviceEventMap;
export type DeviceEventHandler<K extends DeviceEventType> = (...a: DeviceEventMap[K]) => void;