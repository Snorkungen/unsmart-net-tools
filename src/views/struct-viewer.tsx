import { Accessor, Component, Setter, createEffect, createMemo, createSignal } from "solid-js"
import { type StructType, type Struct } from "../lib/binary"
import { UDP_HEADER } from "../lib/header/udp";

type AnyStruct = Struct<any>;

const TABLE_WIDTH = 32; // 4-Bytes

/** just can't be bothered to do anything else */
function struct_get_types<T extends Record<string, StructType<any>>>(struct: Struct<T>): T {
    // @ts-expect-error
    return struct.types;
}

/** https://stackoverflow.com/a/57688223 */
const truncateString = (string = '', maxLength = 50) =>
    string.length > maxLength
        ? `${string.substring(0, maxLength)}…`
        : string

const StructViewerComponent: Component<{ struct: AnyStruct, active_value_idx: Accessor<number>, set_active_value_idx: Setter<number> }> = ({ struct, active_value_idx, set_active_value_idx }) => {
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

        content = truncateString(
            `"${name.toString()}": ${struct.get(name)}`,
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

                "opacity": active_value_idx() == i ? "0.8" : undefined,
                "border-bottom-color": active_value_idx() == i ? "#000" : undefined
            }}
            onclick={() => set_active_value_idx(i)}
        >{content}</div>
    })}
    </div>
}

export const StructViewer: Component = () => {


    let struct: AnyStruct = UDP_HEADER.create({
        sport: 9023,
        dport: 7000,
        length: 30,
        payload: new Uint8Array({ length: 30 - UDP_HEADER.getMinSize() })
    });

    // The struct is known, so the only thing that is needed is the idx, invalid idx means that it is the struct
    const [active_value_idx, set_active_value_idx] = createSignal<number>(-1);
    const active_value = createMemo(() => {
        if (active_value_idx() >= 0 && active_value_idx() < struct.order.length) {
            let key = struct.order[active_value_idx()]
            return {
                key: key,
                // @ts-expect-error
                offset: struct.getTypeBitOffset(),
                struct_type: struct_get_types(struct)[key]
            }
        }

        return struct;
    }, struct)

    // !TODO: someway to inspect value, and bit information

    return <div>
        <StructViewerComponent struct={struct} active_value_idx={active_value_idx} set_active_value_idx={set_active_value_idx} />
        <div>
            Here we show information about the selected item
        </div>
    </div>
}