import { SLICE, Struct, StructOptions, StructType } from "../binary/struct";
import { ARP_HEADER } from "../header/arp";
import { DHCP_HEADER, DHCP_OPTION, DHCP_CHADDR } from "../header/dhcp/dhcp";
import { ETHERNET_HEADER, ETHERNET_DOT1Q_HEADER } from "../header/ethernet";
import { ICMP_HEADER, ICMP_UNUSED_HEADER, ICMP_ECHO_HEADER, ICMP_NDP_HEADER, ICMP_DESTINATION_UNREACHABLE } from "../header/icmp";
import { IPV4_HEADER, IPV4_PSEUDO_HEADER, IPV6_HEADER, IPV6_PSEUDO_HEADER } from "../header/ip";
import { PCAP_GLOBAL_HEADER, PCAP_PACKET_HEADER, PCAP_RECORD_HEADER } from "../header/pcap";
import { PCAPNG_BLOCK, PCAPNG_EPACKET, PCAPNG_IFACE_DESC, PCAPNG_OPTION, PCAPNG_SECTION_HEADER, PCAPNG_SPACKET } from "../header/pcapng";
import { TCP_HEADER } from "../header/tcp";
import { UDP_HEADER } from "../header/udp";

export type AnyStructType = StructType<any>;
export type AnyStruct = Struct<any>;

export const DEFINED_STRUCTS: Record<string, AnyStruct> = {
    ARP_HEADER,

    PCAP_GLOBAL_HEADER,
    PCAP_PACKET_HEADER,
    PCAP_RECORD_HEADER,

    PCAPNG_BLOCK,
    PCAPNG_OPTION,
    PCAPNG_SECTION_HEADER,
    PCAPNG_IFACE_DESC,
    PCAPNG_SPACKET,
    PCAPNG_EPACKET,

    TCP_HEADER,
    UDP_HEADER,

    IPV4_HEADER,
    IPV4_PSEUDO_HEADER,
    IPV6_HEADER,
    IPV6_PSEUDO_HEADER,

    ICMP_HEADER,
    ICMP_UNUSED_HEADER,
    ICMP_ECHO_HEADER,
    ICMP_NDP_HEADER,
    ICMP_DESTINATION_UNREACHABLE,

    ETHERNET_HEADER,
    ETHERNET_DOT1Q_HEADER,

    DHCP_HEADER,
    DHCP_OPTION,
    DHCP_CHADDR,

};

export function struct_get_types(struct: AnyStruct): Record<number | string | symbol, StructType<any>> {
    // @ts-expect-error
    return struct.types;
}
export function struct_get_options(struct: AnyStruct) {
    // @ts-expect-error
    return struct.options;
}

export function get_suitable_structs(buffer: Uint8Array, strict = false, structs = DEFINED_STRUCTS): Record<string, AnyStruct> {
    let result: Record<string, AnyStruct> = {}

    for (let key in structs) {
        let struct = structs[key];

        // 1st check that the buffer fits the minimum size
        if (buffer.byteLength < struct.getMinSize()) {
            continue;
        }

        // 2nd where strict mode is apparent if the structs last value is NOT variable sized check that the lenghts match
        if (strict && struct_get_types(struct)[struct.order.at(-1)!].bitLength > 0 && struct.size != buffer.byteLength) {
            continue
        }

        result[key] = struct;
    }

    return result;
}

export type StructViewerKey = number[] | number;

export interface StructViewerField {
    key: StructViewerKey;

    /** bitoffset is in relation to the struct which the field is derrived from */
    bitOffset: number;

    /** When defined value is negative, when fething the offset can be calculated */
    realBitOffset: number;
    /** used when when walking the tree, to exfiltrate the parent struct */
    parent_struct?: AnyStruct;

    bitLength: number;
    name: string;

    struct_type: AnyStructType;

    struct?: AnyStruct;
    fields?: StructViewerField[];
}

export type StructViewerData = {
    buffer: Uint8Array;
    offset: number;

    struct: AnyStruct;
    fields: StructViewerField[];
}

export function struct_viewer_key(key: StructViewerKey, allow_empty = false) {
    if (typeof key == "number") {
        return [key]

    }

    if (!allow_empty && key.length < 1) {
        throw new Error("struct viewer key is invalid" + key)
    }

    return key;
}

export function struct_viewer_keys_equal(a: StructViewerKey, b: StructViewerKey) {
    if (a == b) {
        return true
    }

    a = struct_viewer_key(a); b = struct_viewer_key(b);

    if (a.length === b.length && a.every((v, i) => v === b[i])) {
        return true
    }
}

export function struct_viewer_get_field(svd: StructViewerData, key: StructViewerKey): StructViewerField {
    if (key === -1) {
        return Object.assign(svd, {
            key: -1,
            bit_offset: svd.offset * 8,
            bitOffset: svd.offset * 8,
            realBitOffset: 0,
            bitLength: svd.struct.size * 8,
            // !TODO: see if there is a way to maybe name structs
            name: "root_struct, a better name should be devised, naming structs maybe??",
            struct_type: SLICE,
        })
    }

    key = struct_viewer_key(key);

    if (key[0] < 0 || key[0] > svd.fields.length) {
        throw new Error("struct viewer key field is invalid")
    }

    let struct = svd.struct;
    let field = svd.fields[key[0]];
    let bit_offset = (svd.offset * 8) + field.bitOffset;

    for (let i = 1; i < key.length; i++) {
        if (!field.fields || !field.fields.length || !field.struct) {
            continue;
        }

        if (key[i] < 0 || key[i] > field.fields.length) {
            throw new Error("struct viewer key field is invalid")
        }

        struct = field.struct;
        field = field.fields[key[i]]

        bit_offset += field.bitOffset;
    }


    field.realBitOffset = bit_offset;
    field.parent_struct = struct;

    return field;
}

export function struct_viewer_get_field_value(svd: StructViewerData, key: StructViewerKey) {
    let field = struct_viewer_get_field(svd, key);

    if (!field.parent_struct) {
        throw new Error("no struct assigned to field")
    }

    // this assumes that all structs are on a byt boundary, could lead to problems
    let struct_byte_offset = Math.floor(field.realBitOffset / 8) - Math.floor(field.bitOffset / 8);

    return field.parent_struct.from(svd.buffer.subarray(struct_byte_offset)).get(field.name);
}

export function struct_viewer_struct_to_fields(struct: AnyStruct, parent_key: StructViewerKey = []): StructViewerField[] {
    if (parent_key == -1) {
        parent_key = []
    }

    let order = struct.order;
    let struct_types = struct_get_types(struct);
    let ordered_struct_types = order.map(key => struct_types[key]);

    let fields = new Array<StructViewerField>(order.length);

    let bit_offset = 0;

    parent_key = struct_viewer_key(parent_key, true);

    for (let i = 0; i < order.length; i++) {
        fields[i] = {
            key: [...parent_key, i], // this might be too much copying
            bitOffset: bit_offset,
            realBitOffset: -1,
            bitLength: ordered_struct_types[i].bitLength,
            name: order[i].toString(),
            struct_type: ordered_struct_types[i],
        }

        bit_offset += ordered_struct_types[i].bitLength;
    }

    return fields;
}

export function struct_viewer_create_svd(buffer: Uint8Array, struct: AnyStruct, offset?: number): StructViewerData;
export function struct_viewer_create_svd(struct: AnyStruct): StructViewerData;
export function struct_viewer_create_svd(input1: Uint8Array | AnyStruct, input2?: AnyStruct, offset?: number): StructViewerData {
    if (!offset) {
        offset = 0;
    }

    let struct: AnyStruct;
    let buffer: Uint8Array;

    if (input1 instanceof Uint8Array) {
        buffer = input1;
        if (!input2) {
            throw new Error("struct not defined§")
        }
        struct = input2;
    } else if (input1 instanceof Struct) {
        struct = input1;
        buffer = struct.getBuffer();
    } else {
        throw new Error(`bad inputs: ${input1}, ${input2}`)
    }

    let fields: StructViewerField[] = struct_viewer_struct_to_fields(struct);

    const svd = {
        buffer: buffer,
        offset,

        struct: struct,
        fields: fields,
    }

    return svd;
}