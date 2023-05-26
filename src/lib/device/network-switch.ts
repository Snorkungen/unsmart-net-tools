import { EthernetFrame } from "../ethernet";
import { Device } from "./device";
import { Interface } from "./interface";


export class NetworkSwitch extends Device {
    macaddresses = new Map<string, Interface>()

    private flood(frame: EthernetFrame,ifID : number) {
        for (let iface of this.interfaces) {
            if (iface.ifID == ifID) {
                continue;
            }

            iface.send(frame);  
        }
    }

    listener(frame: EthernetFrame, iface: Interface) {
        this.log(frame, iface);

        /*
            Future problem to solve is vlans interface already has some logic built in
        */

        // set source address in 
        this.macaddresses.set(frame.source.toString(), iface);

        // find iface for destination
        let destIface = this.macaddresses.get(frame.destination.toString());

        if (destIface) {
            destIface.send(frame);
        } else {
            this.flood(frame, iface.ifID);
        }       
    }
}