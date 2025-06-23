import { MACAddress } from "../../address/mac";
import { uint8_equals } from "../../binary/uint8-array";
import { ETHER_TYPES, ETHERNET_HEADER } from "../../header/ethernet";
import { Program, ProcessSignal, Device, Process, Contact, NetworkData } from "../device"
import { EthernetInterface } from "../interface";
import { DeviceResource } from "../internals/resources";
import { storev_bigint, storev_boolean, storev_discrete, storev_number, storev_Object, StoreValueT } from "../internals/store";
import { network_switch_get_ports, network_switch_set_ports, NetworkSwitchPortState } from "../network-switch";

export const DAEMON_STP_SERVER: Program<ServerData> = {
    name: "daemon_stp_server",
    init(proc) {
        if (proc.device.processes.items.find(p => p && p.id.includes(this.name))) {
            return ProcessSignal.EXIT; // server already running
        }

        const device = proc.device;

        setup_stp_state(proc);
        setup_ports(proc);
        ports_state_selection(proc);

        // create a contact & setup listener
        const contact = device.contact_create("RAW", "RAW").data!;
        contact.receive(receive.bind(proc));

        // INITIALIZE STATE

        // SET timeout and send out initial bpdu
        proc.data.timer_ref_hello = proc.resources.create(
            device.schedule(() => {
                // start hello timer

                // spam out config bpdu's

            }) // do something ...
        )

        return ProcessSignal.__EXPLICIT__;
    },
}

type ServerData = {
    timer_ref_hello?: DeviceResource;
    timer_ref_tcn?: DeviceResource;
    timer_ref_topology_change?: DeviceResource;
    timer_ref_message_age: { [x: number]: DeviceResource | undefined };
    timer_ref_forward_delay: { [x: number]: DeviceResource | undefined };
};

type STP_State = StoreValueT<typeof global_stp_data>;
const global_stp_data = storev_Object({
    designated_root: storev_bigint,
    root_path_cost: storev_number,
    root_port: storev_number,
    max_age: storev_number,
    hello_time: storev_number,
    forward_delay: storev_number,
    bridge_id: storev_bigint,
    bridge_max_age: storev_number,
    bridge_hello_time: storev_number,
    bridge_forward_delay: storev_number,
    topology_change_detected: storev_boolean,
    topology_change: storev_boolean,
    topology_change_time: storev_number,
    hold_time: storev_number,
});

type STP_Ports = StoreValueT<typeof global_stp_ports_definition>;
const global_stp_ports_definition = storev_discrete(storev_Object({
    port_id: storev_number,
    path_cost: storev_number,
    designated_root: storev_bigint,
    designated_cost: storev_number,
    designated_bridge: storev_bigint,
    designated_port: storev_number,
    topology_change_acknowledge: storev_boolean,
    config_pending: storev_boolean,
    change_detection_enabled: storev_boolean,
}));

export const DAEMON_STP_SERVER_PORTS_STORE_KEY = "daemon_stp_server:ports";
export const DAEMON_STP_SERVER_STATE_STORE_KEY = "daemon_stp_server:state";

const STP_DESTINATION = new MACAddress("01-80-C2-00-00-00");
const DEFAULT_PRIORITY = 32768;
const DEFAULT_PORT_PRIORITY = 128;
const DEFAULT_PATH_COST = 10; // Arbitrary number
const DEFAULT_HELLO_TIME = 2;
const DEFAULT_MAX_AGE = 6;
const DEFAULT_FORWARD_DELAY = 4;

const TCN_BPDU_TYPE = 128;
const CONFIG_BPDU_TYPE = 0;
const BPDU_FLAG_TOPOLOGY_CHANGE_ACK = 0x1;
const BPDU_FLAG_TOPOLOGY_CHANGE = 0x8;

function receive(this: Process<ServerData>, contact: Contact, data: NetworkData) {
    if (!data.rcvif || data.rcvif.header !== ETHERNET_HEADER) {
        return; // ignore
    }

    const etherhdr = ETHERNET_HEADER.from(data.buffer);
    const dmac = etherhdr.get("dmac");

    if (!uint8_equals(dmac.buffer, STP_DESTINATION.buffer)) {
        return; // ignore
    }

    const ports = network_switch_get_ports(this.device);
    const port = Object.values(ports).find((p) => p.iface == data.rcvif);
    if (!port) {
        return; // ignore
    }

    // !NOTE: this bpdu implementation is consistently wrong
    let payload = etherhdr.get("payload");

    if (etherhdr.get("ethertype") == ETHER_TYPES.VLAN) {
        payload = payload.subarray(4); // remove vlan hdr
    }

    throw new Error("not implemented functionality missing")
}

function setup_stp_state(proc: Process<ServerData>) {
    // 1st generate a bridge identifier
    const device = proc.device;
    const ports = network_switch_get_ports(device);

    let iface = Object.values(ports).find(p => p.iface instanceof EthernetInterface) as undefined | EthernetInterface;
    if (!iface) {
        throw new Error("could not setup stp state no valid port found")
    }

    const bridge_id = create_bridge_identifier(iface.macAddress, DEFAULT_PRIORITY);
    const bridge_forward_delay = DEFAULT_FORWARD_DELAY, bridge_hello_time = DEFAULT_HELLO_TIME, bridge_max_age = DEFAULT_MAX_AGE;

    const state: STP_State = {
        bridge_id: bridge_id,
        designated_root: bridge_id,
        root_path_cost: 0,
        root_port: 0,
        bridge_forward_delay: bridge_forward_delay,
        forward_delay: bridge_forward_delay,
        bridge_hello_time: bridge_hello_time,
        hello_time: bridge_hello_time,
        bridge_max_age: bridge_max_age,
        max_age: bridge_max_age,
        topology_change: false,
        topology_change_detected: false,
        topology_change_time: 0,
        hold_time: 0,
    }

    device.store_set(DAEMON_STP_SERVER_STATE_STORE_KEY, state);

    // set the proc data
    proc.data = {
        timer_ref_hello: undefined,
        timer_ref_tcn: undefined,
        timer_ref_topology_change: undefined,
        timer_ref_forward_delay: {},
        timer_ref_message_age: {},
    }
}

/** Potentially handle <event>"store_set", `NETWORK_SWITCH_PORTS_STORE_KEY`  */
function setup_ports(proc: Process<ServerData>) {
    const device: Device = proc.device;
    const state = device.store_get<STP_State>(DAEMON_STP_SERVER_STATE_STORE_KEY)!;
    const ports = network_switch_get_ports(device);
    const stp_ports: STP_Ports = {};

    // Initialize ports & stuff
    for (let key of Object.keys(ports)) {
        let port = ports[parseInt(key) /* Annoying work-around */];
        device.interface_mcast_subscribe(port.iface, STP_DESTINATION);

        // !NOTE: what happens if a port get's created later and needs to be setup

        let port_id = port.port_no | ((DEFAULT_PORT_PRIORITY & 0xF0) << 8);
        stp_ports[port.port_no] = {
            path_cost: DEFAULT_PATH_COST,
            port_id: port_id,
            designated_root: state.designated_root,
            designated_cost: state.root_path_cost,
            designated_bridge: state.bridge_id,
            designated_port: port_id,
            topology_change_acknowledge: false,
            config_pending: false,
            change_detection_enabled: true,
        };

        port.state = NetworkSwitchPortState.BLOCKING;

        // stop_message_age_timer
        // stop_forward_delay_timer
        // stop_hold_timer
    }

    device.store_set(DAEMON_STP_SERVER_PORTS_STORE_KEY, stp_ports);
    network_switch_set_ports(device, ports);
}

function ports_state_selection(proc: Process<ServerData>) {
    const device = proc.device;
    const state = device.store_get<STP_State>(DAEMON_STP_SERVER_PORTS_STORE_KEY)!;
    const stp_ports = device.store_get<STP_Ports>(DAEMON_STP_SERVER_PORTS_STORE_KEY)!;

    for (let port_no in stp_ports) {
        let stp_port = stp_ports[port_no];

        if (stp_port.port_id === state.root_port) {
            stp_port.config_pending = false;
            stp_port.topology_change_acknowledge = false;

            make_forwarding(proc, port_no);
        } else if (is_designated_port(state, stp_port)) {
            stop_message_age_timer(proc, port_no);
            make_forwarding(proc, port_no);
        } else {
            stp_port.config_pending = false;
            stp_port.topology_change_acknowledge = false;
            make_blocking(proc, port_no);
        }
    }

    device.store_set(DAEMON_STP_SERVER_PORTS_STORE_KEY, stp_ports);
}

function is_designated_port(state: STP_State, stp_port: STP_Ports[number]) {
    return ((stp_port.designated_bridge === state.bridge_id) && (stp_port.designated_port === stp_port.port_id));
}

function make_forwarding(proc: Process<ServerData>, port_no: number | string) {
    const device = proc.device;
    const ports = network_switch_get_ports(device);
    const port = ports[parseInt(port_no.toString())];

    if (port.state !== NetworkSwitchPortState.BLOCKING) {
        return;
    }

    port.state = NetworkSwitchPortState.LISTENING;
    start_forward_delay_timer(proc, port_no);
    network_switch_set_ports(device, ports);
}

function make_blocking(proc: Process<ServerData>, port_no: number | string) {
    const device = proc.device;
    const ports = network_switch_get_ports(device);
    const port = ports[parseInt(port_no.toString())];
    const stp_ports = device.store_get<STP_Ports>(DAEMON_STP_SERVER_PORTS_STORE_KEY)!;
    const stp_port = stp_ports[port_no];

    if (!(port.state !== NetworkSwitchPortState.DISABLED && port.state !== NetworkSwitchPortState.BLOCKING)) {
        return;
    }

    if ((port.state == NetworkSwitchPortState.FORWARDING || port.state == NetworkSwitchPortState.LEARNING) && stp_port.change_detection_enabled) {
        topology_change_detection(proc, port_no);
    }

    port.state = NetworkSwitchPortState.BLOCKING;
    stop_forward_delay_timer(proc, port_no);
    network_switch_set_ports(device, ports);
}

function stop_message_age_timer(proc: Process<ServerData>, port_no: number | string) {
    let resource = proc.data.timer_ref_message_age[parseInt(port_no.toString())];
    if (resource) {
        resource.close();
    }
}

function create_bridge_identifier(addr: MACAddress, priority: number): bigint {
    let result = 0n;

    // set the priority
    result |= BigInt(priority & 0xFFFF) << BigInt(6 * 8);

    // not sure if this is correct ...
    result |= BigInt(addr.buffer[0]) << BigInt(5 * 8);
    result |= BigInt(addr.buffer[1]) << BigInt(4 * 8);
    result |= BigInt(addr.buffer[2]) << BigInt(3 * 8);
    result |= BigInt(addr.buffer[3]) << BigInt(2 * 8);
    result |= BigInt(addr.buffer[4]) << BigInt(1 * 8);
    result |= BigInt(addr.buffer[5])

    return result;
}