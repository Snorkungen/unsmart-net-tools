export type DeviceEventMap = {
    "interface_add": [];
    "interface_remove": [];
    "interface_set_address": [];
    "interface_mcast_subscribe": [];
    "interface_mcast_unsubscribe": [];

    "store_set": [string];
    "store_delete": [string];
};

export type DeviceEventType = keyof DeviceEventMap;
