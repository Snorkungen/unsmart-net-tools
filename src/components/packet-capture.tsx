import { uintArrayToBitArray } from "../lib/binary/array-buffer/uint-x-array";
import { BitArray, base64_decode, base64_encode } from "../lib/binary";
import { PCAP_GLOBAL_HEADER, PCAP_PACKET_HEADER } from "../lib/packet-capture/pcap";
import { SLICE, Struct, UINT16, UINT32, UINT8, defineStruct, defineStructType } from "../lib/binary/struct";
import { MACAddress } from "../lib/ethernet";
import { For } from "solid-js";
import { AddressV4 } from "../lib/ip/v4";
import { ETHER_TYPES } from "../lib/ethernet/types";
import { PROTOCOLS } from "../lib/ip/packet/protocols";
import { IPV4_HEADER } from "../lib/ip/packet";


const MAC_ADDRESS = defineStructType({
    bitLength: MACAddress.address_length,
    getter(buffer) {
        return new MACAddress(new BitArray(buffer.toString("hex"), 16))
    },
    setter(val) {
        return Buffer.from(val.bits.toString(16))
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
    let buffer = Buffer.from(hexEncodePCAPFile, "hex")
    let pcapHeader = PCAP_GLOBAL_HEADER.create(buffer.slice(0, PCAP_GLOBAL_HEADER.getMinSize()), { bigEndian: false })
    let offset = PCAP_GLOBAL_HEADER.getMinSize();

    console.log(stringifyStruct(pcapHeader))

    let data: Array<[typeof PCAP_PACKET_HEADER, typeof ETHERNET_HEADER]> = [];

    while (offset < buffer.length) {
        let packetHeader = PCAP_PACKET_HEADER.create(buffer.slice(offset, offset += PCAP_PACKET_HEADER.getMinSize()), { bigEndian: false })
        let ethHeader = ETHERNET_HEADER.create(buffer.slice(offset, offset += (packetHeader.get("inclLen"))));

        data.push([packetHeader, ethHeader])
        
    }

    // console.log(data)

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

        console.log(ethHeader)

        if (ethHeader.get("ethertype") == ETHER_TYPES.IPv4) {
            let ipHeader = IPV4_HEADER.create(ethHeader.get("payload").subarray(0, -(UINT32.bitLength / 8)));
            console.log(stringifyStruct(ipHeader))
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
                    console.log(buf.toString("hex"))
                
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

let hexEncodePCAPFile = "d4c3b2a102000400000000000000000000200000010000009fb5cd4d28c307003c0000003c000000c20d66d70000c20966b0000008004500001c00da0000011101e40a000102ac100002c012829a0008061d0000000000000000000000000000000000009fb5cd4d3dc707004600000046000000c20966b00000c20d66d70000080045c00038064a0000ff019eb80a0001010a0001020b00ac2d000000004500001c00da0000011101e40a000102ac100002c012829a0008061d9fb5cd4d2dd307003c0000003c000000c20d66d70000c20966b0000008004500001c00db0000011101e30a000102ac100002c013829b0008061b0000000000000000000000000000000000009fb5cd4d50d707004600000046000000c20966b00000c20d66d70000080045c00038064b0000ff019eb70a0001010a0001020b00ac2d000000004500001c00db0000011101e30a000102ac100002c013829b0008061b9fb5cd4dc0f107003c0000003c000000c20d66d70000c20966b0000008004500001c00dc0000011101e20a000102ac100002c014829c000806190000000000000000000000000000000000009fb5cd4dbdf907004600000046000000c20966b00000c20d66d70000080045c00038064c0000ff019eb60a0001010a0001020b00ac2d000000004500001c00dc0000011101e20a000102ac100002c014829c000806199fb5cd4deefc07003c0000003c000000c20d66d70000c20966b0000008004500001c00dd0000021100e10a000102ac100002c015829d000806170000000000000000000000000000000000009fb5cd4d48330800ba000000ba000000c20966b00000c20d66d70000080045c000ac09b60000f80199d40a0009050a0001020b00ac2d000000004500001c00dd0000011101e10a000102ac100002c015829d000806170000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020004dee000c010100013001000161019fb5cd4d1c3e08003c0000003c000000c20d66d70000c20966b0000008004500001c00de0000021100e00a000102ac100002c016829e000806150000000000000000000000000000000000009fb5cd4d9a960800ba000000ba000000c20966b00000c20d66d70000080045c000ac09b70000f80199d30a0009050a0001020b00ac2d000000004500001c00de0000011101e00a000102ac100002c016829e000806150000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020004dee000c010100013001000161019fb5cd4d2ea708003c0000003c000000c20d66d70000c20966b0000008004500001c00df0000021100df0a000102ac100002c017829f000806130000000000000000000000000000000000009fb5cd4d0cf10800ba000000ba000000c20966b00000c20d66d70000080045c000ac09b80000f80199d20a0009050a0001020b00ac2d000000004500001c00df0000011101df0a000102ac100002c017829f000806130000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020004dee000c010100013001000161019fb5cd4d9ff808003c0000003c000000c20d66d70000c20966b0000008004500001c00e000000311ffdd0a000102ac100002c01882a0000806110000000000000000000000000000000000009fb5cd4db03c0900ba000000ba000000c20966b00000c20d66d70000080045c000ac098d0000f90199000a0009020a0001020b00ac2d000000004500001c00e00000021100de0a000102ac100002c01882a0000806110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020004ded000c010100013001000161029fb5cd4d2c4409003c0000003c000000c20d66d70000c20966b0000008004500001c00e100000311ffdc0a000102ac100002c01982a10008060f0000000000000000000000000000000000009fb5cd4d2e7a0900ba000000ba000000c20966b00000c20d66d70000080045c000ac098e0000f90198ff0a0009020a0001020b00ac2d000000004500001c00e10000021100dd0a000102ac100002c01982a10008060f0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020004ded000c010100013001000161029fb5cd4d488709003c0000003c000000c20d66d70000c20966b0000008004500001c00e200000311ffdb0a000102ac100002c01a82a20008060d0000000000000000000000000000000000009fb5cd4d5cd30900ba000000ba000000c20966b00000c20d66d70000080045c000ac098f0000f90198fe0a0009020a0001020b00ac2d000000004500001c00e20000021100dc0a000102ac100002c01a82a20008060d0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020004ded000c010100013001000161029fb5cd4d09dd09003c0000003c000000c20d66d70000c20966b0000008004500001c00e300000411feda0a000102ac100002c01b82a30008060b0000000000000000000000000000000000009fb5cd4de1150a00b6000000b6000000c20966b00000c20d66d700000800450000a805f60000fc01a15c0a0002010a0001020b00ac2d000000004500001c00e30000021100db0a000102ac100002c01b82a30008060b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020007df400080101000161019fb5cd4d3d1d0a003c0000003c000000c20d66d70000c20966b0000008004500001c00e400000411fed90a000102ac100002c01c82a4000806090000000000000000000000000000000000009fb5cd4d2c5c0a00b6000000b6000000c20966b00000c20d66d700000800450000a805f80000fc01a15a0a0002010a0001020b00ac2d000000004500001c00e40000021100da0a000102ac100002c01c82a4000806090000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020007df400080101000161019fb5cd4d7d650a003c0000003c000000c20d66d70000c20966b0000008004500001c00e500000411fed80a000102ac100002c01d82a5000806070000000000000000000000000000000000009fb5cd4d73a40a00b6000000b6000000c20966b00000c20d66d700000800450000a805fa0000fc01a1580a0002010a0001020b00ac2d000000004500001c00e50000021100d90a000102ac100002c01d82a5000806070000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000020007df400080101000161019fb5cd4dd3ad0a003c0000003c000000c20d66d70000c20966b0000008004500001c00e600000511fdd70a000102ac100002c01e82a6000806050000000000000000000000000000000000009fb5cd4d30fe0a004600000046000000c20966b00000c20d66d70000080045c0003800cc0000fb01a7350a0002020a0001020303b42a000000004500001c00e60000011101d80a000102ac100002c01e82a6000806059fb5cd4dbd040b003c0000003c000000c20d66d70000c20966b0000008004500001c00e700000511fdd60a000102ac100002c01f82a700080603000000000000000000000000000000000000a2b5cd4de23b0b003c0000003c000000c20d66d70000c20966b0000008004500001c00e800000511fdd50a000102ac100002c02082a800080601000000000000000000000000000000000000a2b5cd4d32950b004600000046000000c20966b00000c20d66d70000080045c0003800cd0000fb01a7340a0002020a0001020303b42a000000004500001c00e80000011101d60a000102ac100002c02082a800080601";