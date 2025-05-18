import type { BaseInterface } from "../interface";

export type DeviceEventMap = {
    "interface_add": [];
    "interface_remove": [];
    "interface_set_address": [];
    "interface_mcast_subscribe": [];
    "interface_mcast_unsubscribe": [];

    "interface_disconnect": [BaseInterface];
    "interface_connect": [BaseInterface];
    "interface_recv": [BaseInterface];
    "interface_send": [BaseInterface];

    "store_set": [string];
    "store_delete": [string];
};

export type DeviceEventType = keyof DeviceEventMap;
