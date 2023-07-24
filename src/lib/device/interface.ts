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

    /** This value tells the device that this interface should be configured using DHCP, either using DHCPv4, DHCPv6 or both.  */
    dhcp?: (4 | 6)[];

    constructor(public ifID: number, macAddress: MACAddress, public forwardCallback: (frame: TEthernetFrame, iface: Interface) => void) {
        this.macAddress = macAddress;
    }

    get isConnected(): boolean {
        return !!this.target;
    }

    onDisconnect?: (iface: Interface) => void;
    disconnect(): boolean {
        if (!this.target) {
            return true;
        }

        let disconnect = this.target.disconnect.bind(this.target);
        this.target = null;

        this.onDisconnect && this.onDisconnect(this);

        return disconnect();
    }

    onConnect?: (iface: Interface) => void;
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

        this.onConnect && this.onConnect(this);
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

        if (!this.vlan) {
            if (this.onSend) this.onSend()
            return this.target!.recieve(frame);
        }

        // Do some fanciful vlan logic
        if (this.vlan.type == "access") {
            if (frame.get("ethertype") != ETHER_TYPES.VLAN) {
                // if untagged pass through
                if (this.onSend) this.onSend()
                return this.target!.recieve(frame);
            }

            let vlanHdr = ETHERNET_DOT1Q_HEADER.from(frame.get("payload"));

            // check if VID is allowed for interface
            if (!this.vlan.vids.includes(vlanHdr.get("vid"))) {
                return; // Discard frame
            }

            frame = untagFrame(frame, vlanHdr);

            if (this.onSend) this.onSend()
            return this.target!.recieve(frame);
        } else if (this.vlan.type == "trunk") {
            if (frame.get("ethertype") != ETHER_TYPES.VLAN) {
                return; // Discard Frame
            }

            let vlanHdr = ETHERNET_DOT1Q_HEADER.from(frame.get("payload"));

            // check if VID is allowed for interface
            if (!this.vlan.vids.includes(vlanHdr.get("vid"))) {
                return; // Discard Frame
            }

            if (this.onSend) this.onSend()
            return this.target!.recieve(frame);
        }

        if (this.onSend) this.onSend()
        return this.target!.recieve(frame);
    }

    private recieve(frame: TEthernetFrame) {
        if (!this.isConnected) {
            // should probably return an error
            return;
        }


        vlanHandler: if (this.vlan) {
            if (this.vlan?.type == "access") {
                if (frame.get("ethertype") != ETHER_TYPES.VLAN) {
                    /** Defaults to 1 */
                    let vid = this.vlan.vids[0] || 1;
                    frame = tagFrame(frame, vid);

                    break vlanHandler;
                }

                let vlanHdr = ETHERNET_DOT1Q_HEADER.from(frame.get("payload"));
                // check if VID is allowed for interface
                if (!this.vlan.vids.includes(vlanHdr.get("vid"))) {
                    break vlanHandler; // discard
                }

                break vlanHandler;
            } else if (this.vlan.type == "trunk") {
                if (frame.get("ethertype") != ETHER_TYPES.VLAN) {
                    break vlanHandler; // discard
                }

                let vlanHdr = ETHERNET_DOT1Q_HEADER.from(frame.get("payload"));
                if (!this.vlan.vids.includes(vlanHdr.get("vid"))) {
                    break vlanHandler; // "Cannot forward; VID not in ifaces access list"
                }

                break vlanHandler;
            }

        }



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

function untagFrame(frame: typeof ETHERNET_HEADER, vlanHdr: typeof ETHERNET_DOT1Q_HEADER) {
    return ETHERNET_HEADER.create({
        dmac: frame.get("dmac"),
        smac: frame.get("smac"),
        ethertype: vlanHdr.get("ethertype"),
        payload: vlanHdr.get("payload")
    });
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