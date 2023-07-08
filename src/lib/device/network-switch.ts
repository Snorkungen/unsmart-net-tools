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

        if (!iface.vlan) {
            return this.forwardFrame(frame, iface);
        }

        if (iface.vlan.type == "access") {
            if (frame.get("ethertype") != ETHER_TYPES.VLAN) {
                /** Defaults to 1 */
                let vid = iface.vlan.vids[0] || 1,
                    taggedFrame = tagFrame(frame, vid);
                return this.forwardFrame(taggedFrame, iface)
            }

            let vlanHdr = ETHERNET_DOT1Q_HEADER.from(frame.get("payload"));
            // check if VID is allowed for interface
            if (!iface.vlan.vids.includes(vlanHdr.get("vid"))) {
                return this.log(frame, iface, "DISCARD"); // "Cannot send; VID not in ifaces access list"
            }

            return this.forwardFrame(frame, iface)
        } else if (iface.vlan.type == "trunk") {
            if (frame.get("ethertype") != ETHER_TYPES.VLAN) {
                return this.log(frame, iface, "DISCARD"); // frame is not tagged
            }

            let vlanHdr = ETHERNET_DOT1Q_HEADER.from(frame.get("payload"));
            if (!iface.vlan.vids.includes(vlanHdr.get("vid"))) {
                return this.log(frame, iface, "DISCARD"); // "Cannot send; VID not in ifaces access list"
            }

            return this.forwardFrame(frame, iface);
        }


        return this.forwardFrame(frame, iface)
    }

    sendFrame(frame: typeof ETHERNET_HEADER, iface: Interface) {
        if (!iface.vlan) {
            return super.sendFrame(frame, iface)
        }

        // Do some fanciful vlan logic

        if (iface.vlan.type == "access") {
            if (frame.get("ethertype") != ETHER_TYPES.VLAN) {
                // if untagged pass through
                return super.sendFrame(frame, iface)
            }

            let vlanHdr = ETHERNET_DOT1Q_HEADER.from(frame.get("payload"));

            // check if VID is allowed for interface
            if (!iface.vlan.vids.includes(vlanHdr.get("vid"))) {
                return this.log(frame, iface, "DISCARD"); // "Cannot send; VID not in ifaces access list"
            }

            frame = untagFrame(frame, vlanHdr);

            return super.sendFrame(frame, iface)
        } else if (iface.vlan.type == "trunk") {
            if (frame.get("ethertype") != ETHER_TYPES.VLAN) {
                // if untagged discard
                return this.log(frame, iface, "DISCARD")
            }

            let vlanHdr = ETHERNET_DOT1Q_HEADER.from(frame.get("payload"));

            // check if VID is allowed for interface
            if (!iface.vlan.vids.includes(vlanHdr.get("vid"))) {
                return this.log(frame, iface, "DISCARD"); // "Cannot send; VID not in ifaces access list"
            }

            // forward frame
            return super.sendFrame(frame, iface);
        }

        return super.sendFrame(frame, iface);
    }
}

function untagFrame(frame: typeof ETHERNET_HEADER, vlanHdr: typeof ETHERNET_DOT1Q_HEADER) {
    frame.set("ethertype", vlanHdr.get("ethertype"));
    frame.set("payload", vlanHdr.get("payload"));
    return frame;
}

function tagFrame(frame: typeof ETHERNET_HEADER, vid: number, pcp: number = 0, dei: number = 0): typeof ETHERNET_HEADER {
    let vlanHdr = ETHERNET_DOT1Q_HEADER.create({
        pcp, dei,
        vid,
        ethertype: frame.get("ethertype"),
        payload: frame.get("payload")
    })

    return ETHERNET_HEADER.create({
        dmac: frame.get("dmac"),
        smac: frame.get("smac"),
        ethertype: ETHER_TYPES.VLAN,
        payload: vlanHdr.getBuffer()
    });
}