import { MACAddress } from "../address/mac";
import { UINT16 } from "../binary/struct";
import { ETHERNET_HEADER } from "../header/ethernet";
import { PCAP_GLOBAL_HEADER, PCAP_MAGIC_NUMBER, PCAP_RECORD_HEADER } from "../header/pcap";
import { Interface } from "./interface";

let macAddressCount = 0;
let startBuf = Buffer.from([0xfa, 0xff, 0x0f, 0])
function createMacAddress() {
    let buf = UINT16.setter(macAddressCount++)
    return new MACAddress(Buffer.concat([startBuf, buf]))
}

let frames = new Map<string, Buffer>();
(window as any).f = frames;
export class Device {
    name = Math.floor(Math.random() * 10_000).toString() + "A";
    interfaces: Interface[] = [];

    log(frame: typeof ETHERNET_HEADER, iface: Interface, type: "RECIEVE" | "SEND" = "RECIEVE") {
        // inform about request
        if (type == "RECIEVE") {
            console.info(`"${this.name}" recieved on interface: ${iface.ifID}, from ${frame.get("smac").toString()}`)
        } else if (type == "SEND") {
            console.info(`"${this.name}" sent from interface: ${iface.ifID}, to ${frame.get("dmac").toString()}`)
        }

        let b = frames.get(this.name);

        let pcapRecordHdr = PCAP_RECORD_HEADER.create({
            inclLen: frame.getBuffer().length,
            origLen: frame.getBuffer().length,
            tsSec: Math.floor(Date.now() / 1_000)
        })

        if (!b) {
            b = PCAP_GLOBAL_HEADER.create({
                "magicNumber": PCAP_MAGIC_NUMBER,
                "versionMajor": 2,
                "versionMinor": 4,
                "thiszone": 2,
                "sigfigs": 0,
                "snaplen": 2 ** 32 - 2,
                "network": 1
            }).getBuffer()
        }

        frames.set(this.name, Buffer.concat([
            b,
            pcapRecordHdr.getBuffer(),
            frame.getBuffer()
        ]))
    }

    listener(frame: typeof ETHERNET_HEADER, iface: Interface) {
        this.log(frame, iface);
    }

    sendFrame(frame: typeof ETHERNET_HEADER, iface: Interface) {
        this.log(frame, iface, "SEND");
        iface.send(frame);
    }

    createInterface(): Interface {
        let iface = new Interface(this.interfaces.length, createMacAddress(), this.listener.bind(this))
        this.interfaces.push(iface);
        return iface;
    }
}