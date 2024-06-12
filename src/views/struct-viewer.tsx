import { Accessor, Component, For, JSX, Match, Setter, Show, Switch, createEffect, createMemo, createSignal } from "solid-js"
import { UDP_HEADER } from "../lib/header/udp";
import { FormSelect } from "solid-bootstrap";
import { DEFINED_STRUCTS, type StructViewerKey, type StructViewerField, get_suitable_structs, struct_get_options, struct_get_types, struct_viewer_create_svd, struct_viewer_get_field, type AnyStruct, StructViewerData, struct_viewer_key, struct_viewer_get_field_value, struct_viewer_struct_to_fields, struct_viewer_keys_equal } from "../lib/struct-viewer/struct-viewer";

const TABLE_WIDTH = 32; // 4-Bytes

const StructTable: Component<{
    svd: Accessor<StructViewerData>,
    active_key: Accessor<StructViewerKey>,
    set_active_key: Setter<StructViewerKey>,
}> = ({ svd, active_key, set_active_key }) => {
    function get_width_and_height(field: StructViewerField) {
        let height = 1;
        let width = field.bitLength
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

    /**
     * Takes the fields and returns a flattened array containing the position information, about the field
     */
    function compute_sizes(fields: StructViewerField[], row_end = 1, col_end = 1): { width: number; height: number; row_start: number; row_end: number; col_start: number; col_end: number; }[] {
        let sizes: ReturnType<typeof compute_sizes> = [];
        // I'm going to need some type of offset
        let sizes_offset = 0
        for (let i = 0; i < fields.length; i++) {
            let field = fields[i];
            let [w, h] = get_width_and_height(field)

            let col_start = col_end;
            let row_start = row_end;

            if (field.struct && field.fields) {
                let rsizes = compute_sizes(field.fields, row_end, col_end);

                sizes.splice(i + sizes_offset, 0, ...rsizes);
                sizes_offset += rsizes.length;
                continue;
            }

            col_end += w;
            if (col_end > TABLE_WIDTH) {
                col_end = 1;
                row_end += h
            }

            sizes[i] = {
                width: w,
                height: h,
                row_start,
                row_end: row_start + h,
                col_start,
                col_end: col_start + w,
            }
        }

        return sizes;
    }

    function flatten_fields(fields: StructViewerField[], pk: StructViewerKey = []): StructViewerField[] {
        fields = [...fields] // memory is cheap
        for (let i = 0; i < fields.length; i++) {
            let field = fields[i]

            // fix the keys
            if (field.struct && field.fields) {
                let ff = flatten_fields(field.fields, [...struct_viewer_key(pk, true), ...struct_viewer_key(field.key)]);
                fields.splice(i, 1, ...ff)
                i += ff.length - 1
            }
        }

        return fields
    }

    let flattened_fields = createMemo(() => flatten_fields(svd().fields)); // flatten fields array
    let precomputed_sizes = createMemo(() => compute_sizes(svd().fields)); // precomput a flattened array of positions
    let row_count = (precomputed_sizes().at(-1)?.row_end || 1) - 1;

    return <div style={{
        display: "grid",
        "grid-template-columns": "repeat(" + TABLE_WIDTH + ", 1fr)",
        "grid-template-rows": "repeat(" + row_count + ", 1fr)",
    }}>{flattened_fields().map((field, i) => {
        let { col_start, col_end, row_start, row_end } = precomputed_sizes()[i]

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

                "color": (struct_viewer_keys_equal(active_key(), field.key)) ? "green" : undefined,
            }}
            onclick={() => {
                set_active_key(field.key)
            }}
        >{field.name}</div>
    })}
    </div>
}

const StructHexViewer: Component<{
    svd: Accessor<StructViewerData>;
    active_field: Accessor<StructViewerField>;
}> = ({ svd, active_field }) => {
    let row_width = 16;

    const active_range = createMemo<[number, number]>(() => {
        let field = active_field();
        if (field.key == -1) {
            return [-1, -1]
        }

        if (field.bitLength < 0) {
            return [
                Math.floor(field.realBitOffset / 8),
                svd().buffer.length
            ]
        }

        return [
            Math.floor(field.realBitOffset / 8),
            Math.ceil((field.realBitOffset + field.bitLength) / 8)
        ]
    })

    return <div style={{ display: "grid", "grid-template-columns": "50% 50%", gap: "1em", padding: "1em", "font-family": "monospace" }}>
        <div style={{
            width: "100%",
            background: "inherit",
            border: "none",
            color: "inherit",
            "text-align": "left"
        }} >{
                [...svd().buffer].map((n, i) => (
                    <span style={{
                        color: (active_range()[0] <= i && active_range()[1] > i) ? "green" : "inherit"
                    }} onclick={() => console.log(i)}>
                        {n.toString(16).padStart(2, "0") + (((i + 1) % row_width == 0) ? "\n" : " ")}
                    </span>
                ))
            }</div>
        <div>{[...svd().buffer].map((n, i) => (
            <span style={{
                color: (active_range()[0] <= i && active_range()[1] > i) ? "green" : "inherit"
            }}>{(n > 32 && n <= 126) ? String.fromCharCode(n) : n == 32 ? <span innerHTML="&nbsp"></span> : "."}</span>
        ))}</div>
    </div>
}

const StructConfigureBytes: Component<{ active_field: Accessor<StructViewerField>; set_active_key: Setter<StructViewerKey>; svd: Accessor<StructViewerData>; set_svd: Setter<StructViewerData>; }> = ({ active_field, set_active_key, svd, set_svd }) => {
    const BYTE_ARRAY_KEY = "BYTE_ARRAY_VALUE";

    let field = active_field()
    const [option, set_option] = createSignal(BYTE_ARRAY_KEY);
    const struct_options = createMemo(() => {
        let svdata = svd(), afield = active_field();

        let options = Object.keys(get_suitable_structs((
            svdata.buffer.subarray(Math.floor(struct_viewer_get_field(svdata, afield.key).realBitOffset / 8))
        ), false));
        if (!struct_viewer_keys_equal(afield.key, -1)) {
            options.unshift(BYTE_ARRAY_KEY)
        }

        return options
    })

    createEffect(() => {
        // set the struct
        // set the option based on the active field
        field = active_field();
        let struct = field.struct;

        if (!struct) {
            return set_option(BYTE_ARRAY_KEY)
        }

        for (let key in DEFINED_STRUCTS) {
            if (DEFINED_STRUCTS[key].name === struct.name) {
                return set_option(key)
            }
        }

        set_option(BYTE_ARRAY_KEY)
    })

    createEffect(() => {
        if (field != active_field() && field.key == -1) {
            return; // this case means that something is really wrong
        }

        if (option() == BYTE_ARRAY_KEY || !(option() in DEFINED_STRUCTS)) {
            // reset the field
            set_svd((s) => {
                field = struct_viewer_get_field(s, active_field().key)

                if (struct_viewer_keys_equal(field.key, -1)) {
                    throw new Error("Cannot set reset the root field")
                } else {
                    field.struct = undefined;
                    field.fields = undefined;
                }

                return s
            })
            return
        }

        let struct = DEFINED_STRUCTS[option()];

        if (struct == field.struct) {
            return;
        }

        set_svd((s) => {
            let field = struct_viewer_get_field(s, active_field().key)
            field.struct = struct;
            field.fields = struct_viewer_struct_to_fields(struct, field.key);
            return s
        })
    })

    return <div>
        <label>Select the appropriate struct for the selected bytes</label>
        <FormSelect oninput={e => set_option(e.currentTarget.value)} value={option()}>
            <For each={struct_options()}>{(key) => (
                <option>{key}</option>
            )}</For>
        </FormSelect>
    </div>
}

const ActiveValueViewer: Component<{
    svd: Accessor<StructViewerData>;
    active_field: Accessor<StructViewerField>;
    set_svd: Setter<StructViewerData>;
    set_active_key: Setter<StructViewerKey>;
}> = ({ svd, active_field, set_svd, set_active_key }) => {
    // !TODO: be able to do some more thoughtful things i do not know what but something would be appreciated

    const value = createMemo(() => struct_viewer_get_field_value(svd(), active_field().key));
    const is_bytes = createMemo(() => active_field().bitLength < 0 || value() instanceof Uint8Array);

    return <div>
        <p><strong>{active_field().name}</strong>: {value().toString()}</p>
        <Show when={is_bytes()}>
            <StructConfigureBytes active_field={active_field} set_svd={set_svd} set_active_key={set_active_key} svd={svd} />
        </Show>
    </div>
}

export const StructViewer: Component<{ struct?: AnyStruct }> = ({ struct }) => {
    if (!struct) {
        struct = UDP_HEADER.create({
            sport: 9023,
            dport: 7000,
            length: 100,
            payload: new Uint8Array({ length: 100 - UDP_HEADER.getMinSize() })
        });
        // struct = IPV4_HEADER
    }
    const [svd, set_svd] = createSignal(struct_viewer_create_svd(struct), { equals: false });
    const [active_key, set_active_key] = createSignal<StructViewerKey>(-1, { equals: false });
    const active_field = createMemo<StructViewerField>(() => (
        struct_viewer_get_field(svd(), active_key())
    ));
    // !TODO: someway to inspect value, and bit information

    return <div>
        <button onclick={() => set_active_key(key => {
            let k = struct_viewer_key(key).slice(0, -1);
            if (k.length) return k;
            return -1;
        })}>Pop selection, temp-name</button>
        <StructTable svd={svd} active_key={active_key} set_active_key={set_active_key} />
        <StructHexViewer svd={svd} active_field={active_field} />
        <div>
            <Show
                when={!!active_field().struct}
                fallback={(
                    <ActiveValueViewer svd={svd} active_field={active_field} set_svd={set_svd} set_active_key={set_active_key} />
                )}
            >
                <div>
                    Some this is a struct with x amount of values and y amount of data
                    <p>{JSON.stringify(struct_get_options(struct))} {active_field().name}</p>
                    <StructConfigureBytes svd={svd} set_svd={set_svd} set_active_key={set_active_key} active_field={active_field} />
                </div>
            </Show>
        </div>
    </div>
}