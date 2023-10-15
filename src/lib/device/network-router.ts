import { and, not } from "../binary";
import { ETHERNET_HEADER, ETHER_TYPES } from "../header/ethernet";
import { IPV4_HEADER } from "../header/ip";
import { Device } from "./device";
import { Interface } from "./interface";
import { DeviceServiceEchoReplier } from "./service/echo-replier";

type EthernetHeader = typeof ETHERNET_HEADER;

/** Really basic I'm done with this project */
export class NetworkRouter extends Device {

    constructor() {
        super()
        this.addService(new DeviceServiceEchoReplier(this))
    }


    listener(frame: EthernetHeader, iface: Interface): void {
        this.log(frame, iface);
        this.contactsHandler.handle(frame, iface);

        switch (frame.get("ethertype")) {
            case ETHER_TYPES.VLAN:
                this.handleVLAN(frame, iface); break;
            case ETHER_TYPES.IPv4:
                this.handleIPV4(frame); break;
        }


    }

    private async handleVLAN(frame: EthernetHeader, iface: Interface) {

    }

    private async handleIPV4(frame: EthernetHeader) {
        let ipHdr = IPV4_HEADER.from(frame.get("payload"));
        let daddr = ipHdr.get("daddr");

        // HACKY Ignore if meant for an interface
        if (this.interfaces.findIndex(({ ipv4Address }) => ipv4Address?.toString() == daddr.toString()) >= 0) {
            return
        }

        // ignore if from weird source or if destination is weird
        // if (ipHdr.get("saddr").buffer.readInt32BE() == 0) {
        if (new DataView(ipHdr.get("saddr").buffer.buffer).getUint32(0, false) == 0) {
            return; // source is "0.0.0.0"
        } else if (daddr.toString() == "255.255.255.255") {
            return; // destination is broadcast
        }

        // find interface with suitable address

        let iface = this.interfaces.find(({ ipv4Address, ipv4SubnetMask }) => {
            if (!ipv4Address || !ipv4SubnetMask) return false;

            // check that daddr is in the same subnet
            return ipv4SubnetMask.compare(ipv4Address, daddr);
        })

        if (!iface) {
            console.warn("Could not find an interface to send with")
            return;
        }

        // check that target is not subnet specific broadcast
        let b = and(daddr.buffer, iface.ipv4SubnetMask!.buffer)
        // if (not(b).readUInt32BE() == 0) {
        if (new DataView(not(b).buffer).getUint32(0, false) == 0) {
            return; // address is ignored
        }


        // determine mac address
        let res = await this.neighborTable.getDiscover(daddr);

        if (typeof res == "number") {
            console.warn("Could not resolve target mac address")
            return;
        }


        frame.set("smac", iface.macAddress);
        frame.set("dmac", res.macAddress);

        res.iface.send(frame);
    }
}


// how am i going to do virtual interface
