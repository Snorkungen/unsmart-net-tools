import { BYTE_ARRAY, defineStruct, UINT16, UINT32, UINT64, UINT8 } from "../binary";

/** Topology Change Notification BPDU */
export const BPDU_TCN_HEADER = defineStruct({
    /* protocol ID (0x0000) */
    "proto_id": UINT16,
    /** version ID (0x00) */
    "version_id": UINT8,
    /** type (0x80) */
    "type": UINT8,
});

/** Configuration BPDU */
export const BPDU_C_HEADER = defineStruct({
    /* protocol ID (0x0000) */
    "proto_id": UINT16,
    "version_id": UINT8,
    "type": UINT8,
    "flags": UINT8,
    "root_id": UINT64,
    "root_path_cost": UINT32,
    "bridge_id": UINT64,
    "port_id": UINT32,
    "message_age": UINT32,
    "max_age": UINT32,
    "hello_time": UINT32,
    "forward_delay": UINT32,
    "v1_length": UINT8,
});