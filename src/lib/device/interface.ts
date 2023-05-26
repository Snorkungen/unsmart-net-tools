//
// The question is. That should the intrefaces determine if a frame should be discarded.
//

import { EthernetFrame, MACAddress } from "../ethernet";
import { VLANTag } from "../ethernet/vlan";
import { AddressV4, SubnetMaskV4 } from "../ip/v4";
import { AddressV6 } from "../ip/v6/address";
export class Interface {
    private target: Interface | null = null;

    vlan?: {
        // first id default
        vids: number[];
        type: "access" | "trunk"
    }

    macAddress: MACAddress;
    ipAddressV4?: AddressV4;
    subnetMaskV4?: SubnetMaskV4;
    ipAddressV6?: AddressV6;
    prefixLength?: number;

    constructor(public ifID: number, macAddress: MACAddress, public forwardCallback: (frame: EthernetFrame, iface: Interface) => void) {
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

    send(frame: EthernetFrame) {
        if (frame.destination.toString() == this.macAddress.toString()) {
            // allow for sending packets to itself
            return this.recieve(frame)
        }

        if (!this.isConnected) {
            // should probabky return an error
            return;
        }

        if (this.vlan && this.vlan.vids.length > 0) {
            if (this.vlan.type == "access") {
                // remove tag
                frame.vlan = null;
            } else if (this.vlan.type == "trunk") {
                // if (frame.vlan && !this.vlan.vids.find(vid => vid.toNumber() == frame.vlan!.vid.toNumber())) {
                //     // frame not in vlan list
                //     return null;
                // }
            }
        }

        return this.target!.recieve(frame);
    }

    private recieve(frame: EthernetFrame) {
        if (!this.isConnected) {
            // should probably return an error
            return;
        }

        if (this.vlan && this.vlan.vids.length > 0) {
            if (this.vlan.type == "access") {
                if (frame.vlan && !this.vlan.vids.find(vid => vid == frame.vlan!.vid)) {
                    // frame not in vlan list
                    return;
                } else if (!frame.vlan) {
                    // add tag
                    frame.vlan = new VLANTag(this.vlan.vids[0]);
                }
            } else if (this.vlan.type == "trunk") {
                // discard if not in list

                if (!frame.vlan) {
                    // discard frame no vlan tag
                    return;
                } else if (!this.vlan.vids.find(vid => vid == frame.vlan!.vid)) {
                    // discard frame not in list
                    return;
                }
            }
        }

        // recieve doesn't return anything 
        return this.forwardCallback(frame, this);
    }
}