import { ETHERNET_HEADER } from "../header/ethernet";
import { Device } from "./device";
import { Interface } from "./interface";


export class NetworkSwitch extends Device {
    macaddresses = new Map<string, Interface>()

    private flood(frame: typeof ETHERNET_HEADER, ifID: number) {
        for (let iface of this.interfaces) {
            if (iface.ifID == ifID) {
                continue;
            }

            iface.send(frame);
        }
    }

    listener(frame: typeof ETHERNET_HEADER, iface: Interface) {
        this.log(frame, iface);

        /*
            Future problem to solve is vlans interface already has some logic built in
        */

        // set source address in 
        this.macaddresses.set(frame.get("smac").toString(), iface);

        // find iface for destination
        let destIface = this.macaddresses.get(frame.get("dmac").toString());

        if (destIface) {
            destIface.send(frame);
        } else {
            this.flood(frame, iface.ifID);
        }
    }
}