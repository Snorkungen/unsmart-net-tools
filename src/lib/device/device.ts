import { MACAddress } from "../address/mac";
import { ETHERNET_HEADER } from "../header/ethernet";
import { PCAP_GLOBAL_HEADER, PCAP_MAGIC_NUMBER, PCAP_RECORD_HEADER } from "../header/pcap";
import { ContactsHandler } from "./contact/contacts-handler";
import { Interface } from "./interface";
import DeviceService from "./service/service";
import NeighborTable from "./neighbor-table";
import { uint8_concat, uint8_fromNumber } from "../binary/uint8-array";
import { DeviceProgram } from "./device-program";

let macAddressCount = 0;
let startBuf = new Uint8Array([0xfa, 0xff, 0x0f, 0])
function createMacAddress(): MACAddress {
    let buf = uint8_fromNumber(macAddressCount++, 2)
    return new MACAddress(uint8_concat([startBuf, buf]))
}

let frames = new Map<string, Uint8Array>();

export class Device {
    name = Math.floor(Math.random() * 10_000).toString() + "A";

    interfaces: Interface[] = [];
    contactsHandler = new ContactsHandler(this)

    neighborTable: NeighborTable = new NeighborTable(this);

    // just too keep a reference to services
    services: Array<DeviceService> = [];

    log(frame: typeof ETHERNET_HEADER, iface: Interface, type: "RECIEVE" | "SEND" | "DISCARD" = "RECIEVE") {
        // inform about request
        if (type == "RECIEVE") {
            console.info(`"${this.name}" recieved on interface: ${iface.ifID}, from ${frame.get("smac").toString()}`)
        } else if (type == "SEND") {
            // console.info(`"${this.name}" sent from interface: ${iface.ifID}, to ${frame.get("dmac").toString()}`)
        } else if (type == "DISCARD") {
            console.info(`"${this.name}", Discarded frame!`)
        }

        // dont add frame if frame is sent to self
        if (type == "SEND" && frame.get("dmac").toString() == iface.macAddress.toString()) {
            return;
        }

        this.addRecordToCapture(frame);
    }

    listener(frame: typeof ETHERNET_HEADER, iface: Interface) {
        this.log(frame, iface);
        this.contactsHandler.handle(frame, iface);
    }

    sendFrame(frame: typeof ETHERNET_HEADER, iface: Interface) {
        this.log(frame, iface, "SEND");
        iface.send(frame);
    }

    createInterface(): Interface {
        let iface = new Interface(this.interfaces.length.toString(), createMacAddress(), this.listener.bind(this))
        this.interfaces.push(iface);

        iface.onConnect = this.handleInterfaceConnection.bind(this);

        return iface;
    }

    handleInterfaceConnection(iface: Interface) {
        iface;
        return; // #DONOTHING
    }

    addRecordToCapture(frame: typeof ETHERNET_HEADER) {
        let b = frames.get(this.name);
        let ms = Date.now()

        let pcapRecordHdr = PCAP_RECORD_HEADER.create({
            inclLen: frame.getBuffer().length,
            origLen: frame.getBuffer().length,
            tsSec: Math.floor(ms / 1000),
            tsUsec: (ms % 1000) * 1000
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

        frames.set(this.name, uint8_concat([
            b,
            pcapRecordHdr.getBuffer(),
            frame.getBuffer()
        ]))
    }

    createCaptureFile(name?: string): File | null {
        let buf = frames.get(this.name);

        if (!buf) return null;

        if (!name) {
            name = `${this.name}_${new Date().toISOString()}.cap`
        }

        let file = new File([buf], `${this.name}-${new Date().getTime()}.cap`, {
            "type": "application/cap",
        })

        return file;
    }

    addService(service: DeviceService) {
        if (!this.services) {
            this.services = [];
        }

        this.services.push(service);
    }

    programs: DeviceProgram[] = [];
    registerProgram(program: DeviceProgram) {
        // could in future have special logic ensuring that no duplicate name programs exist
        this.programs.unshift(program)
    }
}

