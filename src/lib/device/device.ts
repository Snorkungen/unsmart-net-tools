import { BitArray } from "../binary";
import { EthernetFrame, MACAddress } from "../ethernet";
import { Interface } from "./interface";

let macAddressCount = 0;
let startBits = new BitArray(0, 24).or(new BitArray("111111110101010100110110", 2));
function createMacAddress() {
    return new MACAddress(startBits.concat(
        new BitArray(0, 24).or(new BitArray(macAddressCount++))
    ))
}
export class Device {
    private name = Math.floor(Math.random() * 10_000).toString() + "A";
    interfaces: Interface[] = [];

    listener(frame: EthernetFrame, iface: Interface) {

        // magic function that interperets and responds to packets

    }

    createInterface(): Interface {
        let iface = new Interface(this.interfaces.length, createMacAddress(), this.listener)
        this.interfaces.push(iface);
        return iface;
    }
}