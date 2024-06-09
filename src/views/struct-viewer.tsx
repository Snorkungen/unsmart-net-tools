import { Component, For } from "solid-js"
import { IPV4_HEADER } from "../lib/header/ip"
import { BYTE_ARRAY, SLICE, Struct, StructOptions, StructType, UINT16, UINT32, UINT8 } from "../lib/binary"
import { UDP_HEADER } from "../lib/header/udp";
import { DHCP_HEADER } from "../lib/header/dhcp/dhcp";

/** just can't be bothered to do anything else */
function struct_get_types<T extends Record<string, StructType<any>>>(struct: Struct<T>): T {
    // @ts-ignore
    return struct.types;
}

/** https://stackoverflow.com/a/57688223 */
const truncateString = (string = '', maxLength = 50) =>
    string.length > maxLength
        ? `${string.substring(0, maxLength)}…`
        : string

type JoinedStructTypes = {
    bitLength: number;
    names: (number | Symbol | string)[]
    struct_types: StructType<any>[]
}

const StructViewerComponent: Component<{ struct: Struct<any> }> = ({ struct }) => {
    const struct_order = [...struct.order];
    // @ts-expect-error
    const struct_types = struct.types as Record<(string | number | symbol), StructType<any>>;

    // transform the data to be series of 8-bit chunks
    // !TODO: join chunks that are smaller than 8-bits into single chunk so it can be handled as a special case
    let ordered_struct_types = struct_order.map((key) => struct_types[key])

    const joined_struct_types_name = "__joined__struct_types"

    let joined_struct_types: Record<number, { names: (string | number | symbol)[]; struct_types: StructType<any>[]; bitLength: number }> = {}



    for (let i = 0; i < struct_order.length; i++) {
        let st = ordered_struct_types[i];

        // the field is not on a an 8-bit boundary
        if (st.bitLength % 8 > 0) {
            // assume that the total length is on an 8-bit boundary
            let bl = st.bitLength;
            for (let j = i + 1; j < struct_order.length; j++) {
                let sub_st = ordered_struct_types[j]
                bl += sub_st.bitLength;

                if (bl % 8 == 0) {
                    // wrap the given values and struct types into a single object
                    // and remove the some stuff from the array
                    // console.log(struct_order.slice(i, j + 1))

                    let names = struct_order.splice(i, j - i + 1, joined_struct_types_name)
                    let struct_types = ordered_struct_types.splice(i, j - i + 1, {
                        bitLength: bl,
                        getter() { throw Error() },
                        setter() { throw Error() }
                    })

                    joined_struct_types[i] = {
                        names,
                        struct_types,
                        bitLength: bl
                    }

                    i -= j - i;
                    break
                }
            }
        }
    }

    function get_width_and_height(struct_type: StructType<any>) {
        let height = 1;
        let width = Math.ceil(struct_type.bitLength / 8)
        if (width > 4) {
            height = Math.ceil(width / 4)
            height = Math.min(height, 4) // cap the height to make it easier to look at
            width = 4
            // do something 
            // modify the height
        } else if (width <= 0) {
            height = 4;
            width = 4;
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
        if (col_end > 4) {
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
        "grid-template-columns": "1fr 1fr 1fr 1fr",
        "grid-template-rows": "repeat(" + row_count + ", 1fr)",
    }}>{struct_order.map((name, i) => {
        let { col_start, col_end, row_start, row_end, width, height } = precomputed_sizes[i]

        let content;
        if (name === joined_struct_types_name) {
            let jst = joined_struct_types[i];
            
            content = <div style={{
                display: "grid",
                width: "100%",
                "grid-template-columns": "repeat(" + jst.bitLength + ", 1fr)",
            }}>{

                    jst.names.map((name, j) => {
                        let st = jst.struct_types[j]
                        let col_start = jst.struct_types.slice(0, j).reduce((sum, { bitLength }) => sum + bitLength, 0) + 1;
                        let col_end = col_start + st.bitLength;
                        return <div style={{
                            "grid-column-start": col_start,
                            "grid-column-end": col_end,

                            "border-left": j == 0 ? "none" : "solid 2px #010101",
                            "text-align": "center"
                        }}>
                            {name.toString()}
                        </div>
                    })
                }</div>
        } else {

            content = truncateString(
                `"${name.toString()}": ${struct.get(name)}`,
                30 // !TODO: compute how many characters can fit into the given field
            )
        }


        return <div style={{
            "grid-column-start": col_start,
            "grid-column-end": col_end,
            "grid-row-start": row_start,
            "grid-row-end": row_end,

            "display": "flex",
            "align-items": "center",
            "justify-content": "center",
            "text-align": "center",

            "padding": "0",
            "border": "solid 2px #010101",
            "border-top": row_start == 1 ? "solid 2px #010101" : "none",
            "border-left": col_start == 1 ? "solid 2px #010101" : "none"
        }}>{content}</div>
    })}
    </div>
}

export const StructViewer: Component = () => {
    let struct = new Struct({
        "test1": UINT8,
        "test2": UINT16,
        "test3": UINT8,
        "test4": UINT32,
        "test5": BYTE_ARRAY(8),
        "payload": SLICE
    })
    let types = struct_get_types(struct)

    return <div>
        {/* <StructViewerComponent struct={struct} ></StructViewerComponent>
        <StructViewerComponent struct={UDP_HEADER} ></StructViewerComponent> */}
        <StructViewerComponent struct={IPV4_HEADER} />
    </div>
}