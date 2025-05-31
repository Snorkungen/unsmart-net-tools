import { Device, DeviceResult, NetworkData, ProcessSignal, Program } from "./device";
import { BaseAddress } from "../address/base";
import { EthernetInterface, type BaseInterface } from "./interface";
import { ETHER_TYPES, ETHERNET_HEADER } from "../header/ethernet";
import { createMask } from "../address/mask";
import { MACAddress } from "../address/mac";
import { uint8_equals } from "../binary/uint8-array";
import { deinitialize, initialization, received_config_bpdu, received_tcn_bpdu, STP_DESTINATION } from "./internals/stp";
import { BPDU_C_HEADER, BPDU_TCN_HEADER } from "../header/bpdu";
import { DeviceResources } from "./internals/resources";

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

    resources: DeviceResources
};

export class NetworkSwitch extends Device {
    /** a reference to device store */
    private data: NetworkSwitchData;

    constructor() {
        super();

        this.store_set(NETWORK_SWITCH_STORE_KEY,
            this.data = {
                macaddresses: [],
                ports: [],
                resources: this.resources
            }
        );

        // start bridging daemon
        this.process_start(NETWORK_SWITCH_BRIDGING_DAEMON);
    }

    /** Hacky thing to prevent the log spam of stp messages */
    log(data: NetworkData, type: "SEND" | "RECEIVE" | "LOOPBACK", record?: boolean) {
        // filter bpdu's
        // let port = Object.values(this.data.ports).find(({ iface: _iface }) => _iface === data.rcvif)
        // if (port && (port.type == "stp") &&
        //     (data.buffer.length > ETHERNET_HEADER.getMinSize()) &&
        //     uint8_equals(ETHERNET_HEADER.from(data.buffer).get("dmac").buffer, STP_DESTINATION.buffer)) {
        //     return // filter;
        // }

        super.log(data, type, record)
    }

    interface_add<F extends BaseInterface>(iface: F): F {
        super.interface_add(iface);

        this.port_create(iface);

        return iface;
    }

    port_create<F extends BaseInterface>(iface: F): DeviceResult<undefined, F> {
        if (iface.virtual || iface.header != ETHERNET_HEADER) {
            return { success: false, message: "unsupported interface type", error: undefined };
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
        let data = proc.device.store_get(NETWORK_SWITCH_STORE_KEY) as NetworkSwitchData;
        if (!data) {
            return ProcessSignal.ERROR;
        }

        function forward(port_no: number, etherheader: typeof ETHERNET_HEADER) {
            let port = data.ports[port_no];

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

        // remove entries from mac address table
        function iface_disconnect_handler(iface: BaseInterface) {
            if (!(iface instanceof EthernetInterface)) return;
            let port = Object.values(data.ports).find(p => p.iface == iface);
            if (!port) return;
            data.macaddresses = data.macaddresses.filter(v => v.outgoing_port != port.port_no);
        }

        let interface_disconnect_event = proc.device.event_create("interface_disconnect", iface_disconnect_handler)

        // setup a contact to listen to all incoming requests
        const contact = proc.contact_create(proc, "RAW", "RAW").data!;
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

            let smac_macaddress_entry_idx = data.macaddresses.findIndex(({ destination }) => uint8_equals(destination.buffer, etherheader.get("smac").buffer));

            if (smac_macaddress_entry_idx >= 0) {
                if (data.macaddresses[smac_macaddress_entry_idx].outgoing_port !== port.port_no) {
                    console.warn("network-switch-bridging daemon out going port changed for destination: " + data.macaddresses[smac_macaddress_entry_idx].destination.toString());
                    data.macaddresses[smac_macaddress_entry_idx].outgoing_port = port.port_no;
                }
            } else {
                data.macaddresses.push({
                    destination: etherheader.get("smac"),
                    outgoing_port: port.port_no
                });
            }

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

        proc.handle(proc, () => {
            contact.close(contact)
            interface_disconnect_event.close();
        });

        return ProcessSignal.__EXPLICIT__;
    },
}

export const NETWORK_SWITCH_STP_DAEMON: Program = {
    name: "network_switch_stp_daemon",
    __NODATA__: true,

    init(proc) {
        const device = proc.device;
        const bdata = device.store_get(NETWORK_SWITCH_STORE_KEY) as NetworkSwitchData;
        // start listening for messages
        if (!bdata || !(device instanceof NetworkSwitch)) return ProcessSignal.ERROR;

        // enumerate ports and subscribe to the mcast address
        for (let port of Object.values(bdata.ports)) {
            device.interface_mcast_subscribe(port.iface, STP_DESTINATION);
        }

        let initialized = false;
        const contact = proc.contact_create(proc, "RAW", "RAW").data!;
        contact.receive(contact, (_, data) => {
            if (!initialized) return;

            let port = Object.values(bdata.ports).find(({ iface }) => iface == data.rcvif)
            if (!port || port.iface.header != ETHERNET_HEADER) {
                return; // not a port
            }

            // this is incorrect the ethernet header is different
            let etherheader = ETHERNET_HEADER.from(data.buffer);
            if (!uint8_equals(etherheader.get("dmac").buffer, STP_DESTINATION.buffer)) return;

            let payload = etherheader.get("payload");
            if (etherheader.get("ethertype") == ETHER_TYPES.VLAN) payload = payload.subarray(4)

            if (payload.length < BPDU_TCN_HEADER.getMinSize()) return;
            let tcn = BPDU_TCN_HEADER.from(payload);
            if (tcn.get("type") == 128) {
                received_tcn_bpdu(bdata as any /* trust */, port as any /* trust */, tcn)
            } else if (payload.length >= BPDU_C_HEADER.getMinSize()) {
                let config = BPDU_C_HEADER.from(payload);
                received_config_bpdu(bdata as any /* trust */, port as any /* trust */, config);
            }
        }, { promiscuous: true });

        initialization(device);
        initialized = true;

        proc.handle(proc, () => {
            deinitialize(device);
            initialized = false;
            contact.close(contact);
        })

        return ProcessSignal.__EXPLICIT__;
    },
}