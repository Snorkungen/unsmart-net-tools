import { BaseAddress } from "../address/base";
import { ETHERNET_HEADER } from "../header/ethernet";
import { Device } from "./device";
import { BaseInterface, Device2, DeviceRoute, EthernetInterface, NetworkData, Process, ProcessSignal, Program } from "./device2";
import { Interface } from "./interface";


export class NetworkSwitch extends Device {
    macaddresses = new Map<string, Interface>()

    private flood(frame: typeof ETHERNET_HEADER, ifID: string) {
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

export class NetworkSwitch2 extends Device2 {
    constructor() {
        super();
        this.process_start(testing_switch_stuff);
    }

    interface_add<F extends BaseInterface>(iface: F): F {
        if (iface instanceof EthernetInterface) {
            iface.vlan_set("access", 1); // initialize vlans so that they all get a vlan
        }

        return super.interface_add(iface);
    }
}

const testing_switch_stuff: Program = {
    name: "testing_switch_stuff",
    init(proc) {
        let contact = proc.device.contact_create("RAW", "RAW").data!;
        let macaddresses = new Map<string, EthernetInterface>();

        contact.receive(contact, (_, data) => {
            if (!(data.rcvif instanceof EthernetInterface)) return;
            let etherheader = ETHERNET_HEADER.from(data.buffer);

            // forward only if destination is not unicast and is has destination set
            let is_unicast = !(data.broadcast || data.multicast);
            if (is_unicast && data.destination) {
                return; // do not forward packet is for host and host only
            }

            function forward(iface: BaseInterface) {
                iface.output({
                    ...data,
                    buffer: etherheader.get("payload"),
                    mode_raw: true
                }, new BaseAddress(etherheader.getBuffer().subarray(0, ETHERNET_HEADER.getMinSize())))
            }

            function flood() {
                for (let iface of proc.device.interfaces) {
                    if (!data.rcvif || iface == data.rcvif || iface.constructor != data.rcvif.constructor || !iface.up) continue;
                    forward(iface)
                }
            }

            macaddresses.set(etherheader.get("smac").toString(), data.rcvif);

            if (data.broadcast || etherheader.get("dmac").isBroadcast()) {
                return flood()
            }

            let iface = macaddresses.get(etherheader.get("dmac").toString());
            if (!iface) {
                return flood()
            }

            forward(iface);
        }, { promiscuous: true });

        proc.handle(proc, () => contact.close(contact))

        return ProcessSignal.__EXPLICIT__;
    },
    __NODATA__: true
}