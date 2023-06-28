import { For } from "solid-js";
import { Struct, UINT32, } from "../lib/binary/struct";
import { calculateChecksum } from "../lib/binary/checksum";
import { BaseAddress } from "../lib/address/base";
import { PCAP_GLOBAL_HEADER, PCAP_PACKET_HEADER } from "../lib/header/pcap";
import { ETHERNET_HEADER, ETHER_TYPES } from "../lib/header/ethernet";
import { IPV4_HEADER, PROTOCOLS } from "../lib/header/ip";
import { ICMP_HEADER, ICMP_UNUSED, ICMPV4_CODES, ICMPV4_TYPES } from "../lib/header/icmp";
import { UDP_HEADER } from "../lib/header/udp";
import { crc32 } from "../lib/binary/crc";

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


export default function PacketCapture() {
    let buffer = Buffer.from(base64EncodedPCAPFile, "base64");
    let offset = 0;
    let pcapHeader = PCAP_GLOBAL_HEADER.from(buffer.subarray(offset, offset += PCAP_GLOBAL_HEADER.size), { bigEndian: false, packed: false })

    let data: Array<[typeof PCAP_PACKET_HEADER, typeof ETHERNET_HEADER]> = [];
    while (offset < buffer.length) {
        let packetHeader = PCAP_PACKET_HEADER.from(buffer.subarray(offset, offset += PCAP_PACKET_HEADER.getMinSize()), { bigEndian: false, packed: false })
        let ethHeader = ETHERNET_HEADER.from(buffer.subarray(offset, offset += (packetHeader.get("inclLen"))));

        data.push([packetHeader, ethHeader])

    }


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
                let unwrapIPv4 = (ipHdrBuffer: Buffer) => {
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
                    let contentIPHdr = unwrapIPv4(ICMP_UNUSED.from(icmpHdr.get("data")).get("data"));

                    entry.negative = true
                    entry.title = `Time Exceeded: ${stringifyConstName(getKeyByValue(ICMPV4_CODES[ICMPV4_TYPES.TIME_EXCEEDED], icmpHdr.get("code")))}`
                } else if (icmpHdr.get("type") == ICMPV4_TYPES.DESTINATION_UNREACHABLE) {
                    let contentIPHdr = unwrapIPv4(ICMP_UNUSED.from(icmpHdr.get("data")).get("data"));

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
                    console.log(buf.toString("base64"))
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
                    <th>Source Port</th>
                    <th>Destination Port</th>
                </tr>
            </thead>
            <tbody>
                <For each={tableEntries} >{({ timestamp, source, destination, protocol, dport, sport, negative, title }, i) => (
                    <tr style={negative && { background: "red" }} title={title}>
                        <td>{i() + 1}</td>
                        <td>{timestamp.toJSON()}</td>
                        <td>{source.toString()}</td>
                        <td>{destination.toString()}</td>
                        <td>{protocol}</td>
                        <td>{sport || null}</td>
                        <td>{dport || null}</td>
                    </tr>
                )}</For>
            </tbody>
        </table>
    </div>
}

let base64EncodedPCAPFile = "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"