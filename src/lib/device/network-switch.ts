import { BaseAddress } from "../address/base";
import { MACAddress } from "../address/mac";
import { createMask } from "../address/mask";
import { ETHERNET_HEADER } from "../header/ethernet";
import { Device, ProcessSignal, Program } from "./device";
import { BaseInterface, EthernetInterface } from "./interface";

export enum NetworkSwitchPortState {
    DISABLED = -1,
    BLOCKING = 0,
    LISTENING = 1,
    LEARNING = 2,
    FORWARDING = 3
}
/** attributes and data needed for the ethernet bridging ... */
export type NetworkSwitchStoreData = {
    ports: Record<string, {
        state: NetworkSwitchPortState,
        priority: number;

        path_cost: number;

    }>;
    /** K: MACAddress.toString(), V: Outgoing port */
    macaddresses: Map<string, EthernetInterface>;


    stp_enabled?: 1; /** truthy value wether if stp is enabled */
    stp_params?: {
        /** designated root */
        root_id: Uint8Array; // actually 64 bit integer but who cares
        root_path_cost: number;
        root_port: string;

        max_age: number,
        hello_time: number;
        forward_delay: number;

        bridge_id: Uint8Array;

        bridge_max_age: number;
        bridge_hello_time: number;
        bridge_forward_delay: number;

        tcn_detected: boolean;
        topology_change: boolean;

        hold_time: 1; // fixed value set to 1
    }
}

export const DAEMON_NETWORK_SWITCH_STORE_KEY = "network_switch_data";
const DAEMON_NETWORK_SWITCH: Program = {
    name: "daemon_network_switch",
    description: "receive and forward ethernet frames",
    init(proc) {
        // NOTE: this program assumes that the store object does not get changed
        const store = proc.device.store.get(DAEMON_NETWORK_SWITCH_STORE_KEY) as NetworkSwitchStoreData;
        if (!store) {
            throw new Error("network switch store is not defined");
        }

        let contact = proc.device.contact_create("RAW", "RAW").data!;

        contact.receive(contact, (_, data) => {
            if (!(data.rcvif instanceof EthernetInterface)) return;
            let etherheader = ETHERNET_HEADER.from(data.buffer);

            // forward only if destination is not unicast and is has destination set
            let is_unicast = !(data.broadcast || data.multicast);
            if (is_unicast && data.destination) {
                return; // do not forward packet is for host and host only
            }

            let dmac = etherheader.get("dmac");
            if (data.multicast || dmac.isMulticast()) {
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

            let rcvif_info = store.ports[data.rcvif.id()];
            if (!rcvif_info) throw new Error("port must be configured");

            function forward(iface: BaseInterface) {
                if (store.ports[iface.id()].state != NetworkSwitchPortState.FORWARDING) {
                    return; // do not forward
                }

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

            if (rcvif_info.state < NetworkSwitchPortState.LEARNING) {
                return; // drop received frame
            }

            store.macaddresses.set(etherheader.get("smac").toString(), data.rcvif);

            if (rcvif_info.state != NetworkSwitchPortState.FORWARDING) {
                return; // do not forward
            }

            if (data.broadcast || etherheader.get("dmac").isBroadcast()) {
                return flood()
            }

            let iface = store.macaddresses.get(etherheader.get("dmac").toString());
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

export class NetworkSwitch extends Device {
    switch_data: NetworkSwitchStoreData;
    constructor() {
        super();

        // set the network swithc store data
        this.switch_data = <NetworkSwitchStoreData>{
            macaddresses: new Map(),
            ports: {},
        }
        this.store.set(DAEMON_NETWORK_SWITCH_STORE_KEY, this.switch_data);

        this.process_start(DAEMON_NETWORK_SWITCH);
    }

    interface_add<F extends BaseInterface>(iface: F): F {
        iface = super.interface_add(iface);

        if (iface instanceof EthernetInterface) {
            iface.vlan_set("access", 1); // initialize vlans so that they all get a vlan

            this.interface_mcast_subscribe(iface, new MACAddress("01-80-C2-00-00-00"));
        }

        let stp_enabled = (this.store.get(DAEMON_NETWORK_SWITCH_STORE_KEY)! as NetworkSwitchStoreData).stp_enabled;

        // add a default port configureation for the given interfce
        (this.store.get(DAEMON_NETWORK_SWITCH_STORE_KEY)! as NetworkSwitchStoreData).ports[iface.id()] = {
            state: !!stp_enabled ? NetworkSwitchPortState.BLOCKING : NetworkSwitchPortState.FORWARDING,

            priority: 0x8000, // default (32768)
            path_cost: 0
            // !TODO: add default port configuration
        }

        return iface;
    }

    /** enable stp for the device & stuff */
    stp_enable() {
        // sanity check
        if (!this.interfaces.some((iface) => iface instanceof EthernetInterface)) {
            throw "cannot enable stp"
        }

        // setup the parameters
        if (!this.store.get(DAEMON_NETWORK_SWITCH_STORE_KEY)) throw "something has gone wrong"


        this.switch_data = this.store.get(DAEMON_NETWORK_SWITCH_STORE_KEY) as NetworkSwitchStoreData;
        this.switch_data.stp_enabled = 1;

        if (this.switch_data.stp_enabled) return;

        let bridge_id = new Uint8Array(8);
        let root_port = ""; // this what is the default no configured value?

        // !TODO: consult the standard for the real numbers
        let max_age = 0, hello_time = 0, forward_delay = 0;

        // !TODO: handle existing parameters
        this.switch_data.stp_params = {
            bridge_id: bridge_id,
            root_id: bridge_id,
            root_path_cost: 0,
            root_port: root_port,

            max_age: max_age,
            hello_time: hello_time,
            forward_delay: forward_delay,
            bridge_max_age: max_age,
            bridge_hello_time: hello_time,
            bridge_forward_delay: forward_delay,

            tcn_detected: false,
            topology_change: false,

            hold_time: 1, // fixed value set to 1
        }

    }
}

export function network_switch_set_port_state(device: Device, iface: BaseInterface, state: NetworkSwitchPortState) {
    if (!(device instanceof NetworkSwitch)) {
        throw new Error("cannot set port state on a non NetworkSwitch device")
    }

    (device.store.get(DAEMON_NETWORK_SWITCH_STORE_KEY)! as NetworkSwitchStoreData).ports[iface.id()].state = state;
}