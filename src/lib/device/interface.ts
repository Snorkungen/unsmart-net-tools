import { EthernetFrame, MACAddress } from "../ethernet";
import { VID, VLANTag } from "../ethernet/vlan";
import { AddressV4, SubnetMaskV4 } from "../ip/v4";
import { AddressV6, SubnetMaskV6 } from "../ip/v6";


export class Interface {
    private target: Interface | null = null;

    vlan?: {
        // first id default
        vids: VID[];
        type: "access" | "trunk"
    }

    macAddress: MACAddress;
    ipAddressV4?: AddressV4;
    subnetMaskV4?: SubnetMaskV4;
    ipAddressV6?: AddressV6;
    subnetMaskV6?: SubnetMaskV6;

    constructor(public ifID: string, macAddress: MACAddress, public forwardCallback: (frame: EthernetFrame) => EthernetFrame | null) {
        this.macAddress = macAddress;
    }

    get isConnected(): boolean {
        return !!this.target;
    }

    connect(target: Interface) {
        if (target.isConnected && target.target != this) {
            throw new Error("target is already connected to another device");
        }

        this.target = target;
        target.connect(this);
    }

    send(frame: EthernetFrame) {
        if (!this.isConnected) {
            // should probabky return an error
            return null;
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
            return null;
        }

        if (frame.destination.toString() != this.macAddress.toString()) {
            if (!frame.destination.isBroadcast) {
                // meant for wrong interface
                return null;
            }
        }

        if (this.vlan && this.vlan.vids.length > 0) {
            if (this.vlan.type == "access") {
                if (frame.vlan && !this.vlan.vids.find(vid => vid.toNumber() == frame.vlan!.vid.toNumber())) {
                    // frame not in vlan list
                    return null;
                } else if (!frame.vlan) {
                    // add tag
                    frame.vlan = new VLANTag(this.vlan.vids[0]);
                }
            } else if (this.vlan.type == "trunk") {
                // discard if not in list

                if (!frame.vlan) {
                    // discard frame no vlan tag
                    return null;
                } else if (!this.vlan.vids.find(vid => vid.toNumber() == frame.vlan!.vid.toNumber())) {
                    // discard frame not in list
                    return null;
                }
            }
        }

        return this.forwardCallback(frame);
    }
}