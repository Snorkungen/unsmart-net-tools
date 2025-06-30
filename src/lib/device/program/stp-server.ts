import { BaseAddress } from "../../address/base";
import { MACAddress } from "../../address/mac";
import { uint8_equals } from "../../binary/uint8-array";
import { BPDU_C_HEADER, BPDU_TCN_HEADER } from "../../header/bpdu";
import { ETHER_TYPES, ETHERNET_HEADER } from "../../header/ethernet";
import { Program, ProcessSignal, Process, Contact, NetworkData, Device } from "../device"
import { EthernetInterface } from "../interface";
import { DeviceResource } from "../internals/resources";
import { storev_bigint, storev_boolean, storev_number, storev_Object, StoreValueT } from "../internals/store";
import { network_switch_get_ports, NetworkSwitchPort, NetworkSwitchPortState } from "../network-switch";

export const DAEMON_STP_SERVER: Program<STP_Server_Data> = {
    name: "daemon_stp_server",
    init(proc) {
        if (proc.device.processes.items.find(p => p && p !== proc && p.id.includes(this.name))) {
            return ProcessSignal.EXIT; // server already running
        }

        const device = proc.device;

        // first of all we's need to configure the state ...
        const ports = network_switch_get_ports(device);
        // find a bridge identifier 
        let mac = (Object.values(ports).find(p => p.iface instanceof EthernetInterface)?.iface as EthernetInterface).macAddress;
        if (!mac) {
            throw new Error("no valid port cofigured");
        }

        proc.data = {
            forward_delay_timers: {},
        }

        const bridge_id = create_bridge_identifier(mac, DEFAULT_PRIORITY);
        const state = device.store_set<STP_State>(DAEMON_STP_SERVER_STATE_STORE_KEY, {
            bridge_id: bridge_id,
            designated_root: bridge_id,
            root_path_cost: 0,
            root_port_no: 0,
            bridge_forward_delay: DEFAULT_FORWARD_DELAY,
            bridge_hello_time: DEFAULT_HELLO_TIME,
            bridge_max_age: DEFAULT_MAX_AGE,
            forward_delay: DEFAULT_FORWARD_DELAY,
            hello_time: DEFAULT_HELLO_TIME,
            max_age: DEFAULT_MAX_AGE,

            topology_change: false,
            topology_change_detected: false,
            topology_change_time: DEFAULT_FORWARD_DELAY + DEFAULT_MAX_AGE,

            // allow for the preconfiguration of things ...
            ...(device.store_get(DAEMON_STP_SERVER_STATE_STORE_KEY) || {}),
        });

        // create a contact & setup listener
        const contact = proc.resources.create(
            device.contact_create("RAW", "RAW").data!
        );
        contact.receive(receive.bind(proc));

        for (let key in ports) {
            let port_no = parseInt(key);
            let port = ports[port_no];
            device.interface_mcast_subscribe(port.iface, STP_DESTINATION);

            initialize_port(proc, port);
        }

        proc.handle(() => {
            const ports = network_switch_get_ports(proc.device);
            for (let key in ports) {
                let port = ports[key];
                proc.device.interface_mcast_unsubscribe(port.iface, STP_DESTINATION);

                if (port.state > NetworkSwitchPortState.DISABLED) {
                    port.state = NetworkSwitchPortState.FORWARDING;
                }
            }
        });

        // start and init everything
        transmit_all_config(proc);
        start_hello_timer(proc);

        return ProcessSignal.__EXPLICIT__;
    },
}

type STP_Server_Data = {
    // message_age_timers: Record<number, DeviceResource | undefined>;
    forward_delay_timers: Record<number, DeviceResource | undefined>;
    hello_timer?: DeviceResource;
    topology_change_timer?: DeviceResource;
    tcn_timer?: DeviceResource;
}

type STP_State = StoreValueT<typeof storev_stp_state>;
const storev_stp_state = storev_Object({
    bridge_id: storev_bigint,
    designated_root: storev_bigint,
    root_path_cost: storev_number,
    /** this is the root port id */
    root_port_no: storev_number,

    max_age: storev_number,
    hello_time: storev_number,
    forward_delay: storev_number,
    bridge_max_age: storev_number,
    bridge_hello_time: storev_number,
    bridge_forward_delay: storev_number,

    topology_change_detected: storev_boolean,
    topology_change: storev_boolean,
    /** 8.5.3.13  */
    topology_change_time: storev_number,
});

// !NOTE: the priority should be configurable ...
type STP_Port = NetworkSwitchPort & StoreValueT<typeof storev_stp_port>;
const storev_stp_port = storev_Object({
    port_id: storev_number,
    path_cost: storev_number,

    // !NOTE: these extra designated information seems to just be some holdovers from set root port
    designated_root: storev_bigint,
    designated_cost: storev_number,
    designated_bridge: storev_bigint,
    designated_port: storev_number,

    topology_change_acknowledge: storev_boolean,
    change_detection_enabled: storev_boolean,
});

export const DAEMON_STP_SERVER_STATE_STORE_KEY = "daemon_stp_server:state";

const STP_DESTINATION = new MACAddress("01-80-C2-00-00-00");
const DEFAULT_PRIORITY = 32768;
const DEFAULT_PORT_PRIORITY = 128;
const DEFAULT_PATH_COST = 10; // Arbitrary number
const DEFAULT_HELLO_TIME = 30;
const DEFAULT_MAX_AGE = 60;
const DEFAULT_FORWARD_DELAY = 0.1;

const TCN_BPDU_TYPE = 128;
const CONFIG_BPDU_TYPE = 0;
const BPDU_FLAG_TOPOLOGY_CHANGE_ACK = 0x1;
const BPDU_FLAG_TOPOLOGY_CHANGE = 0x8;

function proc_log(proc: Process, message: string) {
    return proc.device.event_dispatch("process_message", proc, "INFO", message)
}

function is_designated_port(port: STP_Port, state: STP_State) {
    return ((port.designated_bridge === state.bridge_id) && port.designated_port === port.port_id)
}

function receive(this: Process<STP_Server_Data>, _: Contact, data: NetworkData) {
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
    if (!port || !storev_stp_port.validate(port, this.device)) {
        return; // ignore
    }

    // !NOTE: this bpdu implementation is consistently wrong
    let payload = etherhdr.get("payload");

    if (etherhdr.get("ethertype") == ETHER_TYPES.VLAN) {
        payload = payload.subarray(4); // remove vlan hdr
    }

    const state = this.device.store_get(DAEMON_STP_SERVER_STATE_STORE_KEY);
    if (!storev_stp_state.validate(state)) return;

    let type = payload[3];
    if (type === TCN_BPDU_TYPE) {
        let bpdu = BPDU_TCN_HEADER.from(payload);
        return receive_tcn(this, bpdu, port, state);
    } else if (type === CONFIG_BPDU_TYPE) {
        let bpdu = BPDU_C_HEADER.from(payload);
        return receive_config(this, bpdu, port, state);
    }
}

function receive_tcn(proc: Process<STP_Server_Data>, bpdu: typeof BPDU_TCN_HEADER, port: STP_Port, state: STP_State) {
    if (port.state == NetworkSwitchPortState.DISABLED) {
        return;
    }

    if (!is_designated_port(port, state)) {
        return;
    }

    topology_change_detection(proc, state);

    // acknowledge topology change
    port.topology_change_acknowledge = true;
    transmit_config(proc, port, state);
}

function topology_change_detection(proc: Process<STP_Server_Data>, state?: STP_State) {
    if (!state) {
        state = proc.device.store_get<STP_State>(DAEMON_STP_SERVER_STATE_STORE_KEY)!;
    }

    // topology change detection
    if (state.designated_root === state.bridge_id) {
        state.topology_change = true;
        start_topology_change_timer(proc);

        proc.device.store_set(DAEMON_STP_SERVER_STATE_STORE_KEY, state);
    } else if (!state.topology_change_detected) {
        transmit_tcn(proc, state);
        start_tcn_timer(proc);
    }

    state.topology_change_detected = false;
}

function receive_config(proc: Process<STP_Server_Data>, bpdu: typeof BPDU_C_HEADER, port: STP_Port, state: STP_State) {
    if (port.state == NetworkSwitchPortState.DISABLED) {
        return;
    }

    const was_root_port = (port.port_no == state.root_port_no);

    let root_id = bpdu.get("root_id");
    let root_path_cost = bpdu.get("root_path_cost");
    let bridge_id = bpdu.get("bridge_id");
    let port_id = bpdu.get("port_id")

    let config_supersedes_port_info = (
        (root_id < port.designated_root) ||
        ((root_id == port.designated_root) && (
            (root_path_cost < port.designated_cost) ||
            (root_path_cost == port.designated_cost && (
                (bridge_id < port.designated_bridge || (
                    bridge_id == port.designated_bridge && (
                        bridge_id != state.bridge_id ||
                        port_id <= port.designated_port
                    )
                ))
            ))
        ))
    );

    if (config_supersedes_port_info) {
        // record config information
        port.designated_root = root_id;
        port.designated_cost = root_path_cost;
        port.designated_bridge = bridge_id;
        port.designated_port = port_id;
        // !TODO: message age timer not suported

        update_configuration_and_ports(proc, state);

        if (state.bridge_id != state.designated_root && was_root_port) {
            stop_hello_timer(proc);

            if (state.topology_change_detected) {
                stop_topology_change_timer(proc);
                transmit_tcn(proc, state);
                start_tcn_timer(proc);
            }
        }

        if (port.port_no == state.root_port_no) {
            // record timeout values ...
            state.max_age = decode_time(bpdu.get("max_age"));
            state.hello_time = decode_time(bpdu.get("hello_time"));
            state.forward_delay = decode_time(bpdu.get("forward_delay"));
            state.topology_change = !!(bpdu.get("flags") & BPDU_FLAG_TOPOLOGY_CHANGE)


            // start and init everything
            transmit_all_config(proc);

            // topology change ack ...
            if (bpdu.get("flags") & BPDU_FLAG_TOPOLOGY_CHANGE_ACK) {
                state.topology_change_detected = false;
                stop_tcn_timer(proc);
            }
        }

        network_switch_get_ports(proc.device);
        proc.device.store_set(DAEMON_STP_SERVER_STATE_STORE_KEY, state);
    } else if (is_designated_port(port, state)) {
        proc_log(proc, "REPLYING")
        transmit_config(proc, port, state); // reply
    }
}

function update_configuration_and_ports(proc: Process<STP_Server_Data>, state: STP_State) {
    // configuration update ...
    // root selection and stuff 
    let root_port = get_root_port(proc);
    // set root port
    if (!root_port) {
        state.root_port_no = 0;
        state.designated_root = state.bridge_id;
        state.root_path_cost = 0;
    } else {
        state.root_port_no = root_port.port_no;
        state.designated_root = root_port.designated_root
        state.root_path_cost = (root_port.designated_cost + root_port.path_cost);
    }

    // port_state_selection & designated_port_selection
    const ports = network_switch_get_ports(proc.device);
    for (let key in ports) {
        let port = ports[key];
        if (!storev_stp_port.validate(port)) {
            continue;
        }

        if (is_designated_port(port, state) || (port.designated_root != state.designated_root) || state.root_path_cost < port.designated_cost || (
            state.root_path_cost == port.designated_cost && (
                state.bridge_id < port.designated_bridge || (state.bridge_id == port.designated_bridge && (
                    port.port_id <= port.designated_port
                ))
            ))) {
            port.designated_root = state.designated_root;
            port.designated_cost = state.root_path_cost;
            port.designated_bridge = state.bridge_id;
            port.designated_port = port.port_id;
        }

        set_port_state(proc, port, state);
    }
}

function get_root_port(proc: Process<STP_Server_Data>) {
    const state = proc.device.store_get<STP_State>(DAEMON_STP_SERVER_STATE_STORE_KEY)!;
    const ports = network_switch_get_ports(proc.device);
    let root_port: STP_Port | undefined;

    for (let key in ports) {
        let port = ports[key];
        if (!storev_stp_port.validate(port)) {
            continue;
        }

        // find best root port
        if (!is_designated_port(port, state) && (port.state != NetworkSwitchPortState.DISABLED) && (port.designated_root < state.bridge_id) &&
            ((!root_port) || (port.designated_root < root_port.designated_root) || (port.designated_root === root_port.designated_root && (
                (port.designated_cost + port.path_cost) < (root_port.designated_cost + root_port.path_cost) ||
                ((port.designated_cost + port.path_cost) == (root_port.designated_cost + root_port.path_cost) && (
                    port.designated_bridge < root_port.designated_bridge ||
                    (port.designated_bridge == root_port.designated_bridge && (port.designated_port < root_port.designated_port ||
                        port.designated_port === root_port.designated_port && port.port_id < root_port.port_id
                    ))
                ))
            )))) {
            root_port = port;
        }
    }

    return root_port;
}

function initialize_port(proc: Process<STP_Server_Data>, port: NetworkSwitchPort) {
    const state = proc.device.store_get<STP_State>(DAEMON_STP_SERVER_STATE_STORE_KEY)!;

    (<STP_Port>port).port_id = create_port_identifier(port.port_no, DEFAULT_PORT_PRIORITY);
    (<STP_Port>port).path_cost = DEFAULT_PATH_COST;
    (<STP_Port>port).designated_root = state.designated_root;
    (<STP_Port>port).designated_cost = state.root_path_cost;
    (<STP_Port>port).designated_bridge = state.bridge_id;
    (<STP_Port>port).designated_port = (<STP_Port>port).port_id;
    (<STP_Port>port).change_detection_enabled = false;
    (<STP_Port>port).topology_change_acknowledge = false;

    if (!storev_stp_port.validate(port)) {
        throw new Error("oops forgot to do something")
    }

    port.state = NetworkSwitchPortState.BLOCKING;

    // stop forward delay timer
    proc.data.forward_delay_timers[port.port_no]?.close();
    delete proc.data.forward_delay_timers[port.port_no]

    set_port_state(proc, port, state);
}

function set_port_state(proc: Process<STP_Server_Data>, port: STP_Port, state: STP_State) {
    if (port.port_no == state.root_port_no) {
        port.topology_change_acknowledge = false;
        make_forwarding(proc, port);
    } else if (is_designated_port(port, state)) {
        // !TODO: message age timer not supported
        make_forwarding(proc, port);
    } else {
        port.topology_change_acknowledge = false;
        make_blocking(proc, port);
    }
}

function send_bpdu(port: NetworkSwitchPort, bpdu: typeof BPDU_C_HEADER | typeof BPDU_TCN_HEADER) {
    // this is incorrect
    port.iface.output({
        buffer: bpdu.getBuffer(),
    }, new BaseAddress(ETHERNET_HEADER.create({
        "dmac": STP_DESTINATION
    }).getBuffer()))
}

function transmit_tcn(proc: Process<STP_Server_Data>, state: STP_State) {
    if (state.root_port_no == 0) return;
    const ports = network_switch_get_ports(proc.device);
    let port = ports[state.root_port_no];

    const bpdu = BPDU_TCN_HEADER.create({
        type: TCN_BPDU_TYPE,
    });

    send_bpdu(port, bpdu);
}

function transmit_config(proc: Process<STP_Server_Data>, port: STP_Port, state: STP_State) {
    let flags = 0;
    if (port.topology_change_acknowledge) flags |= BPDU_FLAG_TOPOLOGY_CHANGE_ACK;
    if (state.topology_change) flags |= BPDU_FLAG_TOPOLOGY_CHANGE;

    const bpdu = BPDU_C_HEADER.create({
        type: CONFIG_BPDU_TYPE,
        root_id: state.designated_root,
        root_path_cost: state.root_path_cost,
        bridge_id: state.bridge_id,

        max_age: encode_time(state.max_age),
        hello_time: encode_time(state.hello_time),
        forward_delay: encode_time(state.forward_delay),

        flags: flags
    });

    // !NOTE: the reference does some things with the message things ..

    port.topology_change_acknowledge = false; // side-effect I do not care about
    send_bpdu(port, bpdu);
}

function transmit_all_config(proc: Process<STP_Server_Data>) {
    const state = proc.device.store_get<STP_State>(DAEMON_STP_SERVER_STATE_STORE_KEY)!;
    const ports = network_switch_get_ports(proc.device);
    for (let key in ports) {
        let port = ports[key]
        if (!storev_stp_port.validate(port)) continue;
        // output the message and stuff

        if (!is_designated_port(port, state) || port.state == NetworkSwitchPortState.DISABLED) {
            continue;
        }

        transmit_config(proc, port, state)
    }
}

function designated_for_some_port(proc: Process<STP_Server_Data>, state: STP_State) {

    for (let port of Object.values(network_switch_get_ports(proc.device))) {
        if (storev_stp_port.validate(port) && (port.designated_bridge == state.bridge_id)) {
            return true;
        }
    }

    return false;
}

function make_forwarding(proc: Process<STP_Server_Data>, port: NetworkSwitchPort) {
    const state = proc.device.store_get<STP_State>(DAEMON_STP_SERVER_STATE_STORE_KEY)!;
    function _recurse() {
        if (port.state == NetworkSwitchPortState.LISTENING) {
            port.state = NetworkSwitchPortState.LEARNING;
        } else if (port.state == NetworkSwitchPortState.LEARNING) {
            port.state = NetworkSwitchPortState.FORWARDING;

            if (!storev_stp_port.validate(port)) return;
            if (designated_for_some_port(proc, state) && port.change_detection_enabled) {
                topology_change_detection(proc, state);
            }
        } else {
            return;
        }

        proc_log(proc, port.port_no + " state changed")

        proc.data.forward_delay_timers[port.port_no] = proc.resources.create(
            proc.device.schedule(_recurse, state.forward_delay * 1000));
    }

    if (port.state === NetworkSwitchPortState.BLOCKING) {
        port.state = NetworkSwitchPortState.LISTENING;

        if (proc.data.forward_delay_timers[port.port_no]) {
            proc.data.forward_delay_timers[port.port_no]?.close();
        }

        proc.data.forward_delay_timers[port.port_no] = proc.resources.create(
            proc.device.schedule(_recurse, state.forward_delay * 1000));
    }
}

function make_blocking(proc: Process<STP_Server_Data>, port: NetworkSwitchPort) {
    if (port.state != NetworkSwitchPortState.DISABLED && port.state != NetworkSwitchPortState.BLOCKING) {
        if (!storev_stp_port.validate(port)) return;
        if ((port.state == NetworkSwitchPortState.FORWARDING || port.state == NetworkSwitchPortState.LEARNING) && port.change_detection_enabled) {
            topology_change_detection(proc)
        }
    }

    port.state = NetworkSwitchPortState.BLOCKING;

    proc.data.forward_delay_timers[port.port_no]?.close();
    delete proc.data.forward_delay_timers[port.port_no];
}

function start_topology_change_timer(proc: Process<STP_Server_Data>) {
    const state = proc.device.store_get<STP_State>(DAEMON_STP_SERVER_STATE_STORE_KEY)!;
    const foo = () => {
        state.topology_change = false;
        state.topology_change_detected = false;
        proc.device.store_set(DAEMON_STP_SERVER_STATE_STORE_KEY, state);
    }

    proc.data.topology_change_timer = proc.resources.create(proc.device.schedule(foo,
        state.topology_change_time * 1000
    ))
}

function stop_topology_change_timer(proc: Process<STP_Server_Data>) {
    proc.data.topology_change_timer?.close();
    delete proc.data.topology_change_timer;
}

function start_hello_timer(proc: Process<STP_Server_Data>) {
    const state = proc.device.store_get<STP_State>(DAEMON_STP_SERVER_STATE_STORE_KEY)!;

    function recurse() {
        // send out config to others ...
        transmit_all_config(proc);
        proc.data.hello_timer = proc.resources.create(proc.device.schedule(recurse, state.hello_time * 1000));
    }

    proc.data.hello_timer?.close();
    proc.data.hello_timer = proc.resources.create(proc.device.schedule(recurse, state.hello_time * 1000));
}

function stop_hello_timer(proc: Process<STP_Server_Data>) {
    proc.data.hello_timer?.close();
    delete proc.data.hello_timer;
}

function start_tcn_timer(proc: Process<STP_Server_Data>) {
    const state = proc.device.store_get<STP_State>(DAEMON_STP_SERVER_STATE_STORE_KEY)!;
    function recurse() {
        if (!proc.data.tcn_timer) return;

        transmit_tcn(proc, state);


        proc.data.tcn_timer = proc.resources.create(proc.device.schedule(recurse,
            state.bridge_hello_time * 1000));
    }

    proc.data.tcn_timer = proc.resources.create(proc.device.schedule(recurse,
        state.bridge_hello_time * 1000));
}

function stop_tcn_timer(proc: Process<STP_Server_Data>) {
    proc.data.tcn_timer?.close();
    delete proc.data.tcn_timer;
}

// NOTE: the time is actually encode some kind of way ....
function decode_time(n: number): number { return n };
function encode_time(n: number): number { return n };

function create_port_identifier(port_no: number, priority: number): number {
    return port_no | (priority << 16);
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

export function stp_enable_port(device: Device, port: NetworkSwitchPort) {
    if (!storev_stp_port.validate(port)) return;
    const proc = device.processes.items.find(p => p && p.program === DAEMON_STP_SERVER);
    const state = device.store_get<STP_State>(DAEMON_STP_SERVER_STATE_STORE_KEY);
    if (!proc || !state) return;

    initialize_port(proc, port);
}

export function stp_disable_port(device: Device, port: NetworkSwitchPort) {
    const proc = device.processes.items.find(p => p && p.program === DAEMON_STP_SERVER);
    const state = device.store_get<STP_State>(DAEMON_STP_SERVER_STATE_STORE_KEY);
    if (!proc || !state) {
        port.state = NetworkSwitchPortState.DISABLED;
        return;
    };

    if (!storev_stp_port.validate(port)) return;

    let root = state.bridge_id == state.designated_root;

    // become designated port
    port.designated_root = state.designated_root;
    port.designated_cost = state.root_path_cost;
    port.designated_bridge = state.bridge_id;
    port.designated_port = port.port_id;

    port.state = NetworkSwitchPortState.DISABLED;
    port.topology_change_acknowledge = false;

    // stop_message_age_timer
    // stop forward delay timer
    proc.data.forward_delay_timers[port.port_no]?.close();
    delete proc.data.forward_delay_timers[port.port_no];

    update_configuration_and_ports(proc, state);

    if (state.bridge_id == state.designated_root && !root) {
        state.max_age = state.bridge_max_age;
        state.hello_time = state.bridge_hello_time;
        state.forward_delay = state.bridge_forward_delay;

        topology_change_detection(proc, state);
        stop_tcn_timer(proc);
        transmit_all_config(proc);
        start_hello_timer(proc);
    }
}