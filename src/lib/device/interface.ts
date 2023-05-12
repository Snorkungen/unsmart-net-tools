import { EthernetFrame, MACAddress } from "../ethernet";
import { VLANTag } from "../ethernet/vlan";
import { AddressV4, SubnetMaskV4 } from "../ip/v4";
import { AddressV6, SubnetMaskV6 } from "../ip/v6";
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
    subnetMaskV6?: SubnetMaskV6;

    constructor(public ifID: number, macAddress: MACAddress, public forwardCallback: (frame: EthernetFrame, iface: Interface) => void) {
        this.macAddress = macAddress;
    }

    get isConnected(): boolean {
        return !!this.target;
    }

    connect(target: Interface) {
        if (this == target) {
            throw new Error("cannot connect to self")
        }

        if (this.target) {
            this.target.target = null;
        }
        target.target = this;
        this.target = target;
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

    recieve(frame: EthernetFrame) {
        if (!this.isConnected) {
            // should probabky return an error
            return;
        }

        if (frame.destination.toString() != this.macAddress.toString()) {
            if (!frame.destination.isBroadcast) {
                // meant for wrong interface
                return;
            }
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