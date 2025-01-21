import { Device, DeviceResult, ProcessSignal, Program } from "./device";
import { BaseAddress } from "../address/base";
import { EthernetInterface, type BaseInterface } from "./interface";
import { ETHERNET_HEADER } from "../header/ethernet";
import { createMask } from "../address/mask";
import { MACAddress } from "../address/mac";
import { uint8_equals } from "../binary/uint8-array";

export enum NetworkSwitchPortState {
    DISABLED = 0,
    BLOCKING = 1,
    LISTENING = 2,
    LEARNING = 3,
    FORWARDING = 4
}

export type NetworkSwitchPort = {
    /** reference to iface */
    iface: BaseInterface;
    type?: unknown;

    port_no: number;
    state: NetworkSwitchPortState;
};

/** KEY for switch store data  */
export const NETWORK_SWITCH_STORE_KEY = "network_switch_data";
export type NetworkSwitchData = {

    /* macaddresses allow for actually time and stuff if that were to be actually saved */
    macaddresses: { destination: BaseAddress, outgoing_port: number }[];

    /** access port by port_id */
    ports: { [x: number]: NetworkSwitchPort };
};

export class NetworkSwitch extends Device {
    /** a reference to device store */
    private data: NetworkSwitchData;

    constructor() {
        super();

        this.data = {
            macaddresses: [],
            ports: [],
        };
        this.store.set(NETWORK_SWITCH_STORE_KEY, this.data);

        // start bridging daemon
        this.process_start(NETWORK_SWITCH_BRIDGING_DAEMON);
    }

    interface_add<F extends BaseInterface>(iface: F): F {
        super.interface_add(iface);

        this.port_create(iface);

        return iface;
    }

    port_create<F extends BaseInterface>(iface: F): DeviceResult<undefined, F> {
        if (iface.header != ETHERNET_HEADER) {
            return { success: false, message: "unsupporte interface type", error: undefined };
        }

        // create port id
        const port_no = this.interfaces.length;
        this.data.ports[port_no] = {
            iface: iface,
            port_no: port_no,

            state: NetworkSwitchPortState.FORWARDING, // stp does not exist for now
        }


        // setup ethernet interface stuff 
        if (iface instanceof EthernetInterface) {
            iface.vlan_set("access", 1); // initialize vlans so that they all get a vlan            
        }

        return { success: true, data: iface };
    }

    port_set_state(port_no: number, state: NetworkSwitchPortState) {
        this.data.ports[port_no].state = state;
    }
    port_iface_set_state(iface: BaseInterface, state: NetworkSwitchPortState) {
        let port = Object.values(this.data.ports).find(({ iface: _iface }) => _iface === iface);
        !!port && this.port_set_state(port?.port_no, state);
    }
}

const NETWORK_SWITCH_BRIDGING_DAEMON: Program = {
    name: "network_switch_bridging_daemon",
    __NODATA__: true,

    init(proc) {
        let data = proc.device.store.get(NETWORK_SWITCH_STORE_KEY) as NetworkSwitchData;
        if (!data) {
            return ProcessSignal.ERROR;
        }

        function forward(port_id: number, etherheader: typeof ETHERNET_HEADER) {
            let port = data.ports[port_id];

            if (port.state != NetworkSwitchPortState.FORWARDING) {
                return; // do not forward
            }

            port.iface.output({
                buffer: etherheader.get("payload"),
                mode_raw: true
            }, new BaseAddress(etherheader.getBuffer().subarray(0, ETHERNET_HEADER.getMinSize())));
        }

        function flood(port_no: number, etherheader: typeof ETHERNET_HEADER) {
            for (let port of Object.values(data.ports)) {
                if (port.port_no == port_no) continue;

                forward(port.port_no, etherheader);
            }
        }

        // setup a contact to listen to all incoming requests
        const contact = proc.device.contact_create("RAW", "RAW").data!;
        contact.receive(contact, (_, ndata) => {
            let port = Object.values(data.ports).find(({ iface }) => iface === ndata.rcvif);
            if (!port) return; // this check also handles the type of the rcvif

            let etherheader = ETHERNET_HEADER.from(ndata.buffer);

            // forward only if destination is not unicast and is has destination set
            let is_unicast = !(ndata.broadcast || ndata.multicast);
            if (is_unicast && ndata.destination) {
                return; // do not forward packet is for host and host only
            }

            let dmac = etherheader.get("dmac");
            if (ndata.multicast || dmac.isMulticast()) {
                /*
                    Source <https://standards.ieee.org/wp-content/uploads/import/documents/tutorials/macgrp.pdf>
                    do not forward the following range of addresses
                    01-80-C2-00-00-00 -> 01-80-C2-00-00-0F
                */
                let mask = createMask(MACAddress, (5 * 8) + 4);
                if (mask.compare(new MACAddress("01-80-C2-00-00-00"), dmac)) {
                    return; // do not forward theese addresses
                }
            }


            if (port.state < NetworkSwitchPortState.LEARNING) {
                return; // drop received frame
            }

            data.macaddresses.push({
                destination: etherheader.get("smac"),
                outgoing_port: port.port_no
            })

            if (port.state != NetworkSwitchPortState.FORWARDING) {
                return; // do not forward
            }


            let macentry = data.macaddresses.find(({ destination }) => uint8_equals(destination.buffer, etherheader.get("dmac").buffer));
            if (macentry) {
                forward(macentry.outgoing_port, etherheader);
            } else {
                flood(port.port_no, etherheader);
            }
        }, { promiscuous: true });

        return ProcessSignal.__EXPLICIT__;
    },
}