import { MACAddress } from "../address/mac";
import { or } from "../binary/buffer-bitwise";
import { UINT16 } from "../binary/struct";
import { ETHERNET_HEADER } from "../header/ethernet";
import { Interface } from "./interface";

let macAddressCount = 0;
let startBuf = Buffer.from([0xfa, 0xff, 0x0f, 0])
function createMacAddress() {
    let buf = UINT16.setter(macAddressCount++)
    return new MACAddress(Buffer.concat([startBuf, buf]))
}

export class Device {
    name = Math.floor(Math.random() * 10_000).toString() + "A";
    interfaces: Interface[] = [];

    log(frame: typeof ETHERNET_HEADER, iface: Interface) {
        // inform about request
        console.info(`${this.name} recieved on interface: ${iface.ifID}, from ${frame.get("smac").toString()}`)
    }

    listener(frame: typeof ETHERNET_HEADER, iface: Interface) {
        this.log(frame, iface);
    }



    createInterface(): Interface {
        let iface = new Interface(this.interfaces.length, createMacAddress(), this.listener.bind(this))
        this.interfaces.push(iface);
        return iface;
    }
}