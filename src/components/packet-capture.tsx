import { uintArrayToBitArray } from "../lib/binary/array-buffer/uint-x-array";
import { base64_decode, base64_encode } from "../lib/binary";
import { PCAP_GLOBAL_HEADER, PCAP_PACKET_HEADER } from "../lib/packet-capture/pcap";
import { SLICE, Struct, UINT16, UINT32, UINT8, defineStruct, defineStructType } from "../lib/binary/struct";
import { MACAddress } from "../lib/ethernet";
import { For } from "solid-js";
import { AddressV4 } from "../lib/ip/v4";
import { ETHER_TYPES } from "../lib/ethernet/types";
import { PROTOCOLS } from "../lib/ip/packet/protocols";
import { IPV4_HEADER } from "../lib/ip/packet";


const MAC_ADDRESS = defineStructType({
    size: MACAddress.address_length,
    getter(bits) {
        return new MACAddress(bits)
    },
    setter(val) {
        return val.bits
    }
})

const ETHERNET_HEADER = defineStruct({
    dmac: MAC_ADDRESS,
    smac: MAC_ADDRESS,
    ethertype: UINT16,
    payload: SLICE
})
function stringifyStruct(struct: Struct<any>) {
    let obj: any = {}

    struct.order.forEach(k => {
        obj[k] = struct.get(k)
    })

    return JSON.stringify(obj, null, 2)
}

export default function PacketCapture() {
    let bits = base64_decode(base64EncodePCAPFile);
    let pcapHeader = PCAP_GLOBAL_HEADER.create(bits.slice(0, PCAP_GLOBAL_HEADER.bits.size), { bigEndian: false })
    let offset = PCAP_GLOBAL_HEADER.bits.size;

    console.log(stringifyStruct(pcapHeader))

    let data: Array<[typeof PCAP_PACKET_HEADER, typeof ETHERNET_HEADER]> = [];

    while (offset < bits.size) {
        let packetHeader = PCAP_PACKET_HEADER.create(bits.slice(offset, offset += PCAP_PACKET_HEADER.bits.size), { bigEndian: false })
        let ethHeader = ETHERNET_HEADER.create(bits.slice(offset, offset += (packetHeader.get("inclLen") * 8)));
        data.push([packetHeader, ethHeader])
    }

    console.log(data)

    type TableEntry = {
        timestamp: Date;
        source: { toString: () => string };
        destination: { toString: () => string };
        protocol: string;
    }
    const getKeyByValue = (obj: Record<string, number>, value: number) => Object.keys(obj).find(key => obj[key] === value) ?? "";
    let tableEntries = data.map(([packetHeader, ethHeader],) => {
        let entry: TableEntry = {
            timestamp: new Date((packetHeader.get("tsSec") + (packetHeader.get("tsUsec") / 1_000_000)) * 1000),
            source: ethHeader.get("smac"),
            destination: ethHeader.get("dmac"),
            protocol: getKeyByValue(ETHER_TYPES, ethHeader.get("ethertype"))
        }

        if (ethHeader.get("ethertype") == ETHER_TYPES.IPv4) {
            let ipHeader = IPV4_HEADER.create(ethHeader.get("payload").slice(0, -UINT32.size));
            entry.source = ipHeader.get("saddr");
            entry.destination = ipHeader.get("daddr");
            entry.protocol = getKeyByValue(PROTOCOLS, ipHeader.get("proto"))
        }

        return entry
    })

    return <div>
        <header>
            <h1>Packet Capture</h1>
            <input type="file" onInput={(event: any) => {
                let file = event.target.files[0] as File
                let reader = new FileReader()
                reader.readAsArrayBuffer(file)
                reader.onloadend = () => {
                    let arr = new Uint8Array(reader.result as ArrayBuffer)
                    let buf = Buffer.from(reader.result as ArrayBuffer)
                    console.log(buf)
                    let bits = uintArrayToBitArray(arr)
                    console.log(base64_encode(bits))
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
                </tr>
            </thead>
            <tbody>
                <For each={tableEntries} >{({ timestamp, source, destination, protocol }, i) => (
                    <tr>
                        <td>{i() + 1}</td>
                        <td>{timestamp.toJSON()}</td>
                        <td>{source.toString()}</td>
                        <td>{destination.toString()}</td>
                        <td>{protocol}</td>
                    </tr>
                )}</For>
            </tbody>
        </table>
    </div>
}

let base64EncodePCAPFile = "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"