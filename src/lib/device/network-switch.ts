import { Device, DeviceResult, NetworkData, ProcessSignal, Program } from "./device";
import { BaseAddress } from "../address/base";
import { EthernetInterface, type BaseInterface } from "./interface";
import { ETHER_TYPES, ETHERNET_HEADER } from "../header/ethernet";
import { createMask } from "../address/mask";
import { MACAddress } from "../address/mac";
import { uint8_equals } from "../binary/uint8-array";
import { deinitialize, initialization, received_config_bpdu, received_tcn_bpdu, STP_DESTINATION } from "./internals/stp";
import { BPDU_C_HEADER, BPDU_TCN_HEADER } from "../header/bpdu";

export const NetworkSwitchPortState = {
    DISABLED: 0,
    BLOCKING: 1,
    LISTENING: 2,
    LEARNING: 3,
    FORWARDING: 4
} as const;

export type NetworkSwitchPort = {
    /** reference to iface */
    iface: BaseInterface;
    type?: unknown;

    port_no: number;
    state: typeof NetworkSwitchPortState[keyof typeof NetworkSwitchPortState];
};

export const NETWORK_SWITCH_MACADDRESSES_STORE_KEY = "network_switch:macaddresses";
export type NetworkSwitchMACAddresses = { destination: MACAddress, outgoing_port: number }[];

export const NETWORK_SWITCH_PORTS_STORE_KEY = "network_switch:ports";
export type NetworkSwitchPorts = { [port_no: number]: NetworkSwitchPort };

function get_macaddress(device: Device): NetworkSwitchMACAddresses {
    const macaddresses = device.store_get<NetworkSwitchMACAddresses>(NETWORK_SWITCH_MACADDRESSES_STORE_KEY)
    if (!macaddresses) {
        throw new Error(device.name + " NetworkSwitch macadresses undefined");
    }
    return macaddresses;
}

function set_macaddress(device: Device, macaddresses: NetworkSwitchMACAddresses): NetworkSwitchMACAddresses {
    return device.store_set<NetworkSwitchMACAddresses>(NETWORK_SWITCH_MACADDRESSES_STORE_KEY, macaddresses)
}

function get_ports<T = NetworkSwitchPorts>(device: Device): T {
    const ports = device.store_get<T>(NETWORK_SWITCH_PORTS_STORE_KEY)
    if (!ports) {
        throw new Error(device.name + " NetworkSwitch ports undefined");
    }
    return ports;
}

function set_ports<T = NetworkSwitchPorts>(device: Device, ports: T): T {
    return device.store_set(NETWORK_SWITCH_PORTS_STORE_KEY, ports);
}

export {
    get_macaddress as network_switch_get_macadresses,
    set_macaddress as network_switch_set_macaddresses,
    get_ports as network_switch_get_ports,
    set_ports as network_switch_set_ports,
}

export class NetworkSwitch extends Device {
    /** a reference to device store */
    constructor() {
        super();

        set_macaddress(this, []);
        set_ports(this, []);

        // start bridging daemon
        this.process_start(NETWORK_SWITCH_BRIDGING_DAEMON);
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

        const ports = get_ports(this);
        const port_no = this.interfaces.length;
        ports[port_no] = {
            iface: iface,
            port_no: port_no,

            state: NetworkSwitchPortState.FORWARDING, // stp does not exist for now
        }
        set_ports(this, ports);

        // setup ethernet interface stuff 
        if (iface instanceof EthernetInterface) {
            iface.vlan_set("access", 1); // initialize vlans so that they all get a vlan            
        }

        return { success: true, data: iface };
    }
}

const NETWORK_SWITCH_BRIDGING_DAEMON: Program = {
    name: "network_switch_bridging_daemon",
    __NODATA__: true,

    init(proc) {
        const ports = get_ports(proc.device);
        let macaddresses = get_macaddress(proc.device);

        function forward(port_no: number, etherheader: typeof ETHERNET_HEADER) {
            let port = ports[port_no];

            if (port.state != NetworkSwitchPortState.FORWARDING) {
                return; // do not forward
            }

            port.iface.output({
                buffer: etherheader.get("payload"),
                mode_raw: true
            }, new BaseAddress(etherheader.getBuffer().subarray(0, ETHERNET_HEADER.getMinSize())));
        }

        function flood(port_no: number, etherheader: typeof ETHERNET_HEADER) {
            for (let port of Object.values(ports)) {
                if (port.port_no != port_no) {
                    forward(port.port_no, etherheader);
                };
            }
        }

        // remove entries from mac address table
        function iface_disconnect_handler(iface: BaseInterface) {
            if (!(iface instanceof EthernetInterface)) return;
            let port = Object.values(ports).find(p => p.iface == iface);
            if (!port || !macaddresses) return;

            macaddresses = proc.device.store_set(NETWORK_SWITCH_MACADDRESSES_STORE_KEY,
                macaddresses.filter(v => v.outgoing_port != port.port_no));
        }

        proc.resources.create(proc.device.event_create("interface_disconnect", iface_disconnect_handler))

        // setup a contact to listen to all incoming requests
        const contact = proc.resources.create(proc.device.contact_create("RAW", "RAW").data!);
        contact.receive((_, ndata) => {
            let port = Object.values(ports).find(({ iface }) => iface === ndata.rcvif);
            if (!port || !macaddresses) return; // this check also handles the type of the rcvif

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

            let smac_macaddress_entry_idx = macaddresses.findIndex(({ destination }) => uint8_equals(destination.buffer, etherheader.get("smac").buffer));

            if (smac_macaddress_entry_idx >= 0) {
                if (macaddresses[smac_macaddress_entry_idx].outgoing_port !== port.port_no) {
                    console.warn("network-switch-bridging daemon out going port changed for destination: " + macaddresses[smac_macaddress_entry_idx].destination.toString());
                    macaddresses[smac_macaddress_entry_idx].outgoing_port = port.port_no;
                    set_macaddress(proc.device, macaddresses);
                }
            } else {
                macaddresses.push({
                    destination: etherheader.get("smac"),
                    outgoing_port: port.port_no
                });
                set_macaddress(proc.device, macaddresses)
            }

            if (port.state != NetworkSwitchPortState.FORWARDING) {
                return; // do not forward
            }

            let macentry = macaddresses.find(({ destination }) => uint8_equals(destination.buffer, etherheader.get("dmac").buffer));
            if (macentry) {
                forward(macentry.outgoing_port, etherheader);
            } else {
                flood(port.port_no, etherheader);
            }
        }, { promiscuous: true });

        return ProcessSignal.__EXPLICIT__;
    }
}

export const NETWORK_SWITCH_STP_DAEMON: Program<ReturnType<typeof initialization>> = {
    name: "network_switch_stp_daemon",
    __NODATA__: true,

    init(proc) {
        let ports = get_ports(proc.device);

        const device = proc.device;

        // enumerate ports and subscribe to the mcast address
        for (let port of Object.values(ports)) {
            device.interface_mcast_subscribe(port.iface, STP_DESTINATION);
        }

        let initialized = false;
        const contact = proc.resources.create(proc.device.contact_create("RAW", "RAW").data!);
        contact.receive((_, data) => {
            if (!initialized || !data.rcvif) return;

            let port = Object.values(ports).find(({ iface }) => iface == data.rcvif)
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
                received_tcn_bpdu(proc.data, port, tcn)
            } else if (payload.length >= BPDU_C_HEADER.getMinSize()) {
                let config = BPDU_C_HEADER.from(payload);
                received_config_bpdu(proc.data, port, config);
            }

            set_ports(proc.device, ports)
        });

        proc.data = initialization(proc, ports);
        initialized = true;
        set_ports(proc.device, ports)

        proc.handle(() => {
            deinitialize(proc);
            set_ports(proc.device, ports)
            initialized = false;
            contact.close();
        })

        return ProcessSignal.__EXPLICIT__;
    },
}