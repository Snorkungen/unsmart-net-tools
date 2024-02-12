import { Component, For } from "solid-js"
import { IPV4_HEADER } from "../lib/header/ip"
import { Struct, StructType } from "../lib/binary"

/** just can't be bothered to do anything else */
function struct_get_types<T extends Record<string, StructType<any>>>(struct: Struct<T>): T {
    // @ts-ignore
    return struct.types;
}

export const StructViewer: Component = () => {
    let struct = IPV4_HEADER
    let types = struct_get_types(struct)

    return <div>
        <For each={(struct).order.map(v => ({ key: v, type: types[v] }))}>
            {({ key, type }) => (
                <div>
                    <span>{key}: </span>
                    <span>{type.bitLength + ""}</span>
                </div>
            )}
        </For>
    </div>
}