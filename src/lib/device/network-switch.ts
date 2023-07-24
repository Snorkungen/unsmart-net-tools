import { ETHERNET_DOT1Q_HEADER, ETHERNET_HEADER, ETHER_TYPES } from "../header/ethernet";
import { Device } from "./device";
import { Interface } from "./interface";


export class NetworkSwitch extends Device {
    macaddresses = new Map<string, Interface>()

    private flood(frame: typeof ETHERNET_HEADER, ifID: number) {
        for (let iface of this.interfaces) {
            if (iface.ifID == ifID) {
                continue;
            }

            this.sendFrame(frame, iface)
        }
    }

    private forwardFrame(frame: typeof ETHERNET_HEADER, iface: Interface) {
        // set source address in 
        this.macaddresses.set(frame.get("smac").toString(), iface);

        // find iface for destination
        let destIface = this.macaddresses.get(frame.get("dmac").toString());

        if (destIface) {
            this.sendFrame(frame, destIface);
        } else {
            this.flood(frame, iface.ifID);
        }
    }

    listener(frame: typeof ETHERNET_HEADER, iface: Interface) {
        this.log(frame, iface);
        return this.forwardFrame(frame, iface)
    }

    createInterface(): Interface {
        let iface = super.createInterface()

        // This is hacky but i think it is valid
        iface.vlan = {
            type: "access",
            vids: [1]
        }

        return iface;
    }
}