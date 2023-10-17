import { Buffer } from "buffer";
import { For, createSignal } from "solid-js";
import { Struct, UINT32, } from "../lib/binary/struct";
import { BaseAddress } from "../lib/address/base";
import { PCAP_GLOBAL_HEADER, PCAP_PACKET_HEADER } from "../lib/header/pcap";
import { ETHERNET_HEADER, ETHER_TYPES } from "../lib/header/ethernet";
import { IPV4_HEADER, PROTOCOLS } from "../lib/header/ip";
import { ICMP_HEADER, ICMP_UNUSED_HEADER, ICMPV4_CODES, ICMPV4_TYPES } from "../lib/header/icmp";
import { UDP_HEADER } from "../lib/header/udp";
import { PacketCapture } from "../lib/packet-capture/capture";
import { PacketCaptureRecordStatus } from "../lib/packet-capture/record";

function stringifyStruct(struct: Struct<any>) {
    let obj: any = {}

    struct.order.forEach(k => {
        obj[k] = struct.get(k) + ""
    })

    return JSON.stringify(obj, null, 2)
}

function stringifyConstName(name: string): string {
    return name.replaceAll("_", " ")
}


export default function PacketCaptureViewer() {
    let buffer = Buffer.from(base64EncodedPCAPFile, "base64");

    let [state, setState] = createSignal<PacketCapture>(new PacketCapture(buffer))




    let data: Array<[typeof PCAP_PACKET_HEADER, typeof ETHERNET_HEADER]> = [];


    type TableEntry = {
        timestamp: Date;
        source: { toString: () => string };
        destination: BaseAddress;
        protocol: string;
        sport?: number,
        dport?: number,

        negative?: true;
        title?: string;
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
            let ipHeader = IPV4_HEADER.from(ethHeader.get("payload").subarray(0, -(UINT32.bitLength / 8)));

            entry.source = ipHeader.get("saddr");
            entry.destination = ipHeader.get("daddr");
            entry.protocol = getKeyByValue(PROTOCOLS, ipHeader.get("proto"))


            if (ipHeader.get("proto") == PROTOCOLS.ICMP) {
                let unwrapIPv4 = (ipHdrBuffer: Uint8Array) => {
                    let contentIPHdr = IPV4_HEADER.from(ipHdrBuffer);
                    if (contentIPHdr.get("proto") == PROTOCOLS.UDP) {
                        let udpHdr = UDP_HEADER.from(contentIPHdr.get("payload"))
                        entry.sport = udpHdr.get("sport")
                        entry.dport = udpHdr.get("dport")

                    }

                    entry.protocol += "->" + getKeyByValue(PROTOCOLS, contentIPHdr.get("proto"))
                    return contentIPHdr;
                }
                let icmpHdr = ICMP_HEADER.from(ipHeader.get("payload"))

                if (icmpHdr.get("type") == ICMPV4_TYPES.TIME_EXCEEDED) {
                    let contentIPHdr = unwrapIPv4(ICMP_UNUSED_HEADER.from(icmpHdr.get("data")).get("data"));

                    entry.negative = true
                    entry.title = `Time Exceeded: ${stringifyConstName(getKeyByValue(ICMPV4_CODES[ICMPV4_TYPES.TIME_EXCEEDED], icmpHdr.get("code")))}`
                } else if (icmpHdr.get("type") == ICMPV4_TYPES.DESTINATION_UNREACHABLE) {
                    let contentIPHdr = unwrapIPv4(ICMP_UNUSED_HEADER.from(icmpHdr.get("data")).get("data"));

                    entry.negative = true;
                    entry.title = `Destination Unreachable: ${stringifyConstName(getKeyByValue(ICMPV4_CODES[ICMPV4_TYPES.DESTINATION_UNREACHABLE], icmpHdr.get("code")))}`
                }
            } else if (ipHeader.get("proto") == PROTOCOLS.UDP) {
                let udpHdr = UDP_HEADER.from(ipHeader.get("payload"))
                entry.sport = udpHdr.get("sport")
                entry.dport = udpHdr.get("dport")
            }
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
                    let buf = Buffer.from(reader.result as ArrayBuffer)
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