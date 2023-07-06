//
// The question is. That should the intrefaces determine if a frame should be discarded.
//

import { IPV4Address } from "../address/ipv4";
import { IPV6Address } from "../address/ipv6";
import { MACAddress } from "../address/mac";
import { AddressMask } from "../address/mask";
import { ETHERNET_DOT1Q_HEADER, ETHERNET_HEADER, ETHER_TYPES } from "../header/ethernet";

type TEthernetFrame = typeof ETHERNET_HEADER;
export class Interface {
    private target: Interface | null = null;

    vlan?: {
        // first id default
        vids: number[];
        type: "access" | "trunk"
    }

    macAddress: MACAddress;
    ipv4Address?: IPV4Address;
    ipv4SubnetMask?: AddressMask<typeof IPV4Address>;
    ipv6Address?: IPV6Address;
    prefixLength?: number;

    constructor(public ifID: number, macAddress: MACAddress, public forwardCallback: (frame: TEthernetFrame, iface: Interface) => void) {
        this.macAddress = macAddress;
    }

    get isConnected(): boolean {
        return !!this.target;
    }

    disconnect(): boolean {
        if (!this.target) {
            return true;
        }

        let disconnect = this.target.disconnect.bind(this.target);
        this.target = null;
        return disconnect();
    }

    connect(target: Interface) {
        if (this == target) {
            throw new Error("cannot connect to self")
        }

        if (this.target == target) {
            return true;
        }

        this.disconnect();
        this.target = target;
        target.connect(this)
    }

    send(frame: TEthernetFrame) {


        if (frame.get("dmac").toString() == this.macAddress.toString()) {
            // allow for sending packets to itself
            return this.recieve(frame)
        }

        if (!this.isConnected) {
            // should probabky return an error
            return;
        }

        // this thing below currently does nothing & will probably be hoisted and handled by upper level logic
        if (this.vlan && this.vlan.vids.length > 0) {
            if (this.vlan.type == "access") {
                // remove tag
            } else if (this.vlan.type == "trunk") {
                // if (frame.vlan && !this.vlan.vids.find(vid => vid.toNumber() == frame.vlan!.vid.toNumber())) {
                //     // frame not in vlan list
                //     return null;
                // }
            }
        }

        if (this.onSend) this.onSend()

        return this.target!.recieve(frame);
    }

    private recieve(frame: TEthernetFrame) {
        if (!this.isConnected) {
            // should probably return an error
            return;
        }

        // inteface doesn't deal with vlans

        // recieve doesn't return anything 

        if (this.onRecv) this.onRecv();

        if (this.recvWait) {
            setTimeout(() => this.forwardCallback(frame, this), this.recvWait)
        } else {

            return this.forwardCallback(frame, this);
        }
    }

    onRecv?: () => void;
    onSend?: () => void;

    recvWait?: number;
}