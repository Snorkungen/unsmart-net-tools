import { Accessor, Component, For, Match, Setter, Switch, createEffect, createMemo, createResource, createSignal } from "solid-js"
import { type StructType, Struct } from "../lib/binary"
import { UDP_HEADER } from "../lib/header/udp";
import { ARP_HEADER } from "../lib/header/arp";
import { PCAP_GLOBAL_HEADER, PCAP_PACKET_HEADER, PCAP_RECORD_HEADER } from "../lib/header/pcap";
import { TCP_HEADER } from "../lib/header/tcp";
import { IPV4_HEADER, IPV4_PSEUDO_HEADER, IPV6_HEADER, IPV6_PSEUDO_HEADER } from "../lib/header/ip";
import { ICMP_DESTINATION_UNREACHABLE, ICMP_ECHO_HEADER, ICMP_HEADER, ICMP_NDP_HEADER, ICMP_UNUSED_HEADER } from "../lib/header/icmp";
import { ETHERNET_DOT1Q_HEADER, ETHERNET_HEADER } from "../lib/header/ethernet";
import { DHCP_CHADDR, DHCP_HEADER, DHCP_OPTION } from "../lib/header/dhcp/dhcp";
import { FormSelect } from "solid-bootstrap";

type AnyStruct = Struct<any>;

const TABLE_WIDTH = 32; // 4-Bytes

// !TODO: move this definition to another file
const DEFINED_STRUCTS: Record<string, AnyStruct> = {
    ARP_HEADER,

    PCAP_GLOBAL_HEADER,
    PCAP_PACKET_HEADER,
    PCAP_RECORD_HEADER,

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

function get_suitable_structs(buffer: Uint8Array, strict = false, structs = DEFINED_STRUCTS): Record<string, AnyStruct> {
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

function struct_get_types(struct: AnyStruct): Record<number | string | symbol, StructType<any>> {
    // @ts-expect-error
    return struct.types;
}
function struct_get_options(struct: AnyStruct) {
    // @ts-expect-error
    return struct.options;
}

/** https://stackoverflow.com/a/57688223 */
const truncateString = (string = '', maxLength = 50) =>
    string.length > maxLength
        ? `${string.substring(0, maxLength)}…`
        : string

const StructTable: Component<{ struct: AnyStruct, active_value_idx: Accessor<number>, set_active_value_idx: Setter<number> }> = ({ struct, active_value_idx, set_active_value_idx }) => {
    const struct_order = [...struct.order];
    // @ts-expect-error
    const struct_types = struct.types as Record<(string | number | symbol), StructType<any>>;

    // transform the data to be series of 8-bit chunks
    // !TODO: join chunks that are smaller than 8-bits into single chunk so it can be handled as a special case
    let ordered_struct_types = struct_order.map((key) => struct_types[key])

    function get_width_and_height(struct_type: StructType<any>) {
        let height = 1;
        let width = struct_type.bitLength
        if (width > TABLE_WIDTH) {
            height = Math.ceil(width / TABLE_WIDTH)
            height = Math.min(height, 4) // cap the height to make it easier to look at
            width = TABLE_WIDTH
            // do something 
            // modify the height
        } else if (width <= 0) {
            height = 4;
            width = TABLE_WIDTH;
        }

        return [width, height]
    }

    // precalculate positions
    let row_end = 1;
    let col_end = 1;

    let precomputed_sizes = ordered_struct_types.map(struct_type => {
        let [w, h] = get_width_and_height(struct_type)

        let col_start = col_end;
        let row_start = row_end;

        col_end += w;
        if (col_end > TABLE_WIDTH) {
            col_end = 1;
            row_end += h
        }

        return {
            width: w,
            height: h,
            row_start,
            row_end: row_start + h,
            col_start,
            col_end: col_start + w
        }
    })

    let row_count = precomputed_sizes.at(-1)!.row_end - 1;

    return <div style={{
        display: "grid",
        "grid-template-columns": "repeat(" + TABLE_WIDTH + ", 1fr)",
        "grid-template-rows": "repeat(" + row_count + ", 1fr)",
    }}>{struct_order.map((name, i) => {
        let { col_start, col_end, row_start, row_end } = precomputed_sizes[i]

        let content;

        content = truncateString(name.toString(),
            30 // !TODO: compute how many characters can fit into the given field
        )

        return <div
            style={{
                "grid-column-start": col_start,
                "grid-column-end": col_end,
                "grid-row-start": row_start,
                "grid-row-end": row_end,

                "display": "flex",
                "align-items": "center",
                "justify-content": "center",
                "text-align": "center",

                "padding": "0.4em",
                "border": "solid 2px #e1e1e1",
                "border-top": row_start == 1 ? "inherit inherit inherit" : "none",
                "border-left": col_start == 1 ? "inherit inherit inherit" : "none",

                "color": active_value_idx() == i ? "green" : undefined,
            }}
            onclick={() => set_active_value_idx(i)}
        >{content}</div>
    })}
    </div>
}

const StructHexViewer: Component<{
    buffer: Uint8Array, active_value: Accessor<AnyStruct | {
        key: string | number | symbol;
        offset: number;
        struct_type: StructType<any>;
    }>
}> = ({ buffer, active_value }) => {
    let row_width = 16;

    const active_range = createMemo<[number, number]>(() => {
        let av = active_value()
        if (av instanceof Struct) {
            return [-1, -1]
        }

        if (av.struct_type.bitLength < 0) {
            return [Math.floor(av.offset / 8), buffer.length]
        }

        return [Math.floor(av.offset / 8), Math.ceil((av.offset + av.struct_type.bitLength) / 8)]
    })

    return <div style={{ display: "grid", "grid-template-columns": "50% 50%", gap: "1em", padding: "1em", "font-family": "monospace" }}>
        <div style={{
            width: "100%",
            background: "inherit",
            border: "none",
            color: "inherit",
            "text-align": "left"
        }} >{
                [...buffer].map((n, i) => (
                    <span style={{
                        color: (active_range()[0] <= i && active_range()[1] > i) ? "green" : "inherit"
                    }}>
                        {n.toString(16).padStart(2, "0") + (((i + 1) % row_width == 0) ? "\n" : " ")}
                    </span>
                ))
            }</div>
        <div>{[...buffer].map((n, i) => (
            <span style={{
                color: (active_range()[0] <= i && active_range()[1] > i) ? "green" : "inherit"
            }}>{(n >= 32 && n <= 126) ? String.fromCharCode(n) : "."}</span>
        ))}</div>
    </div>
}

const ActiveValueViewer: Component<{
    struct: AnyStruct, active_value: Accessor<{
        key: string | number | symbol;
        offset: number;
        struct_type: StructType<any>;
    }>
}> = ({ active_value, struct }) => {
    // !TODO: be able to do some more thoughtful things i do not know what but something would be appreciated

    const struct_type = createMemo(() => active_value().struct_type)
    const value = createMemo(() => struct.get(active_value().key))
    const is_bytes = createMemo(() => struct_type().bitLength < 0 || value() instanceof Uint8Array)

    const BYTE_ARRAY_KEY = "BYTE_ARRAY_VALUE"

    const [selected_key, set_selected_key] = createSignal(BYTE_ARRAY_KEY)
    const content = createMemo(() => {
        if (selected_key() == BYTE_ARRAY_KEY) {
            return null; // maybe some more advanced way of looking at the bytes maybe
        }

        if (!(selected_key() in DEFINED_STRUCTS)) {
            return null
        }


        return <StructViewer struct={DEFINED_STRUCTS[selected_key()].from(value())} />;
    })

    return <div>
        <p><strong>{active_value().key.toString()}</strong>: {value()}</p>
        <Switch>
            <Match when={is_bytes()}>
                <div>
                    <label>Select the appropriate struct for the selected bytes</label>
                    <FormSelect oninput={(e) => set_selected_key(e.target.value)} value={selected_key()}>
                        <option value={BYTE_ARRAY_KEY}>Byte Array</option>
                        <For each={Object.keys(get_suitable_structs(value(), true))}>{(key) => (
                            <option>{key}</option>
                        )}</For>
                    </FormSelect>
                    {content()}
                </div>
            </Match>
        </Switch>
    </div>
}

export const StructViewer: Component<{ struct?: AnyStruct }> = ({ struct }) => {
    if (!struct) {
        struct = UDP_HEADER.create({
            sport: 9023,
            dport: 7000,
            length: 30,
            payload: new Uint8Array({ length: 30 - UDP_HEADER.getMinSize() })
        });
    }

    // The struct is known, so the only thing that is needed is the idx, invalid idx means that it is the struct
    const [active_value_idx, set_active_value_idx] = createSignal<number>(-1);
    const active_value = createMemo(() => {
        if (active_value_idx() >= 0 && active_value_idx() < struct.order.length) {
            let key = struct.order[active_value_idx()]
            return {
                key: key,
                // @ts-expect-error
                offset: struct.getTypeBitOffset(key),
                struct_type: struct_get_types(struct)[key]
            }
        }

        return struct;
    }, struct)

    // !TODO: someway to inspect value, and bit information

    return <div>
        <StructTable struct={struct} active_value_idx={active_value_idx} set_active_value_idx={set_active_value_idx} />
        <div>
            <StructHexViewer buffer={struct.getBuffer()} active_value={active_value} />

            <Switch>
                <Match when={active_value() instanceof Struct}>
                    <div>
                        Some this is a struct with x amount of values and y amount of data
                        <p>{JSON.stringify(struct_get_options(struct))}</p>
                    </div>
                </Match>
                <Match when={!(active_value() instanceof Struct)}>
                    <ActiveValueViewer struct={struct} active_value={active_value as any} />
                </Match>
            </Switch>
        </div>
    </div>
}