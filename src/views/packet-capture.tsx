import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { PacketCapture, PacketCaptureRecord, PacketCaptureRecordStatus } from "../lib/packet-capture";
import { uint8_fromBase64 } from "../lib/binary/uint8array/base64";
import { StructViewer } from "./struct-viewer";
import { defineStruct, StructType } from "../lib/binary";

export default function PacketCaptureViewer() {
    let buffer = uint8_fromBase64(base64EncodedPCAPFile);

    let [state, setState] = createSignal<PacketCapture>(new PacketCapture(buffer))

    let ref: any = undefined;
    const [selected_record, set_selected_record] = createSignal<undefined | PacketCaptureRecord>(undefined);
    createEffect(() => set_selected_record(state().records[0]))

    function handle_row_click(record: PacketCaptureRecord) {
        ref && ref.scrollIntoView()
        set_selected_record(record);
    }

    const struct = createMemo(() => {
        let record = selected_record();
        if (!record) return undefined;

        let keys: any = {}
        record.structs.forEach((s, i) => {
            // @ts-expect-error
            let entries = Object.entries(s.types);
            entries.forEach(([n, v]) => {
                if ((v as StructType<unknown>).bitLength < 0 && (i + 1) !== record.structs.length) { return };

                keys[i + "." + n] = v;
            })
        });

        return defineStruct(keys);
    });

    return <div>
        <header>
            <h1>Packet Capture</h1>
            <input type="file" accept=".cap, .pcap, .pcapng" onInput={(event: any) => {
                let file = event.target.files[0] as File
                let reader = new FileReader()
                reader.readAsArrayBuffer(file)
                reader.onloadend = () => {
                    let buf = new Uint8Array(reader.result as ArrayBuffer)
                    setState(new PacketCapture(buf))
                    // console.log(arr)
                }
            }} />
        </header>
        <main style={{ overflow: "none", height: "100%" }}>
            <table>
                <thead>
                    <tr>
                        <th>No.</th>
                        <th>Time</th>
                        <th>Source</th>
                        <th>Destination</th>
                        <th>Protocol</th>
                        <th>Length</th>
                        <th>Info</th>
                    </tr>
                </thead>
                <tbody>
                    <For each={state().records} >{(record) => (
                        <tr style={{
                            background: (record.status == PacketCaptureRecordStatus.ERROR || record.status == PacketCaptureRecordStatus.WARNING) ? "red" : "inherit",
                        }} title={record.info.join("; ")} onclick={() => handle_row_click(record)}>
                            <td>{record.index + 1}</td>
                            <td>{record.timestamp.getTime() - state().records[0].timestamp.getTime()}</td>
                            <td>{record.saddr.toString()}</td>
                            <td>{record.daddr.toString()}</td>
                            <td>{record.protocol}</td>
                            <td>{record.fullLength}</td>
                            <td>{record.info.join("; ")}</td>
                        </tr>
                    )}</For>
                </tbody>
            </table>
            <div ref={e => ref = e}>
                <Show when={struct()} >
                    <StructViewer struct={struct()!.from(selected_record()!.buffer)} />
                </Show>
            </div>
        </main>
    </div>
}

let base64EncodedPCAPFile = "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"