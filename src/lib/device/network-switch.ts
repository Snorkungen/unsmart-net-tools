import { BaseAddress } from "../address/base";
import { ETHERNET_HEADER } from "../header/ethernet";
import { BaseInterface, Device2, EthernetInterface, ProcessSignal, Program } from "./device2";


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