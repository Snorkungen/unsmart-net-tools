import { BitArray } from "../binary";
import { EthernetFrame, MACAddress } from "../ethernet";
import { Interface } from "./interface";

let macAddressCount = 0;
let startBits = new BitArray(0, 24).or(new BitArray("fa20f0", 16));
function createMacAddress() {
    return new MACAddress(startBits.concat(
        new BitArray(0, 14).or(new BitArray(macAddressCount++)),
        new BitArray(0, 10).or(new BitArray(Math.floor(Math.random() * (2 ** 10 - 1)))),
    ))
}

export class Device {
    name = Math.floor(Math.random() * 10_000).toString() + "A";
    interfaces: Interface[] = [];

    log(frame: EthernetFrame, iface: Interface) {
        // inform about request
        console.info(`${this.name} recieved on interface: ${iface.ifID}, from ${frame.source.toString()}`)
    }

    listener(frame: EthernetFrame, iface: Interface) {
        this.log(frame, iface);
    }



    createInterface(): Interface {
        let iface = new Interface(this.interfaces.length, createMacAddress(), this.listener.bind(this))
        this.interfaces.push(iface);
        return iface;
    }
}