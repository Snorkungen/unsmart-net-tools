import { For, createMemo, createSignal } from "solid-js";
import { PacketCapture, PacketCaptureRecordStatus } from "../lib/packet-capture";
import { uint8_fromBase64 } from "../lib/binary/uint8array/base64";
import { StructViewer } from "./struct-viewer";
import { PCAPNG_BLOCK } from "../lib/header/pcapng";

export default function PacketCaptureViewer() {
    let buffer = uint8_fromBase64(base64EncodedPCAPFile);

    let [state, setState] = createSignal<PacketCapture>(new PacketCapture(buffer))
    let struct = createMemo(() => PCAPNG_BLOCK.from(state().buffer.subarray(0, 32 * 5)))

    return <div>
        <StructViewer struct={struct()} />
        <header>
            <h1>Packet Capture</h1>
            <input type="file" onInput={(event: any) => {
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
        <table>
            <thead>
                <tr>
                    <th>No.</th>
                    <th>Timestamp</th>
                    <th>Source</th>
                    <th>Destination</th>
                    <th>Protocol</th>
                    <th>Length</th>
                    <th>Info</th>
                </tr>
            </thead>
            <tbody>
                <For each={state().records} >{(record) => (
                    <tr style={(record.status == PacketCaptureRecordStatus.ERROR || record.status == PacketCaptureRecordStatus.WARNING) ? { background: "red" } : undefined} title={record.info.join("; ")}>
                        <td>{record.index + 1}</td>
                        <td>{record.timestamp.toJSON()}</td>
                        <td>{record.saddr.toString()}</td>
                        <td>{record.daddr.toString()}</td>
                        <td>{record.protocol}</td>
                        <td>{record.fullLength}</td>
                        <td>{record.info.join("; ")}</td>
                    </tr>
                )}</For>
            </tbody>
        </table>
    </div>
}

let base64EncodedPCAPFile = "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"