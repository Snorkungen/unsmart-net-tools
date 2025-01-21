/*
    The stp protocol implementation shall be a tightly coupled yet seperate.
    Device program

    See [ANSI/IEEE Std 802.1D, 1998 Edition, chapter 8.9]
*/

import { BaseAddress } from "../../address/base";
import { MACAddress } from "../../address/mac";
import { BPDU_C_HEADER, BPDU_TCN_HEADER } from "../../header/bpdu";
import { ETHERNET_HEADER } from "../../header/ethernet";
import { EthernetInterface } from "../interface";
import { type NetworkSwitchPort, type NetworkSwitchData, NETWORK_SWITCH_STORE_KEY, NetworkSwitch, NetworkSwitchPortState } from "../network-switch";


// unexported constants
const DEFAULT_PRIORITY = 32768;
const DEFAULT_PORT_PRIORITY = 128;
const DEFAULT_PATH_COST = 10; // Arbitrary number
const DEFAULT_HELLO_TIME = 1;
const DEFAULT_MAX_AGE = 6;
const DEFAULT_FORWARD_DELAY = 4;

export const STP_DESTINATION = new MACAddress("01-80-C2-00-00-00");

const TCN_BPDU_TYPE = 128;
const CONFIG_BPDU_TYPE = 0;
const BPDU_FLAG_TOPOLOGY_CHANGE_ACK = 0x1;
const BPDU_FLAG_TOPOLOGY_CHANGE = 0x8;



type NetworkSwitchPortSTP = NetworkSwitchPort & {
    type: "stp";

    port_id: number;
    path_cost: number;
    designated_root: bigint;
    designated_cost: number;
    designated_bridge: bigint;
    designated_port: number;
    topology_change_acknowledge: boolean;
    config_pending: boolean;
    change_detection_enabled: boolean;
};

type NetworkSwitchDataSTP = NetworkSwitchData & {
    designated_root: bigint;
    root_path_cost: number;
    root_port: number;
    max_age: number;
    hello_time: number;
    forward_delay: number;
    bridge_id: bigint,
    bridge_max_age: number;
    bridge_hello_time: number;
    bridge_forward_delay: number;
    topology_change_detected: boolean;
    topology_change: boolean;
    topology_change_time: number;
    hold_time: number;

    // references to callbacks
    timer_ref_hello: number;
    timer_ref_tcn: number;
    timer_ref_topology_change: number;
    timer_ref_message_age: { [x: number]: number };
    timer_ref_forward_delay: { [x: number]: number };
}

function validate_port(port: NetworkSwitchPort): port is NetworkSwitchPortSTP {
    return port.type == "stp";
}

function designated_port(bdata: NetworkSwitchDataSTP, port: NetworkSwitchPortSTP) {
    return ((port.designated_bridge == bdata.bridge_id) && (port.designated_port == port.port_id));
}

function root_bridge(bdata: NetworkSwitchDataSTP) {
    return bdata.designated_root == bdata.bridge_id;
}

function supercedes_port_info(bdata: NetworkSwitchDataSTP, port: NetworkSwitchPortSTP, config: typeof BPDU_C_HEADER) {
    return (
        (config.get("root_id") < port.designated_root) ||
        ((config.get("root_id") == port.designated_root) &&
            ((config.get("root_path_cost") < port.designated_cost) ||
                ((config.get("root_path_cost") == port.designated_cost) &&
                    ((config.get("bridge_id") < port.designated_bridge) ||
                        ((config.get("bridge_id") == port.designated_bridge) &&
                            ((config.get("bridge_id") != bdata.bridge_id) || config.get("port_id") <= port.designated_port)
                        )
                    )
                )
            )
        )
    )
}

function topology_change_detection(bdata: NetworkSwitchDataSTP) {
    if (root_bridge(bdata)) {
        bdata.topology_change = true;
        start_topology_change_timer(bdata);
    } else if (!bdata.topology_change_detected) {
        transmit_tcn(bdata);
        start_tcn_timer(bdata);
    }

    bdata.topology_change_detected = true;
}

function topology_change_acknowledge(bdata: NetworkSwitchDataSTP) {
    bdata.topology_change_detected = false;
    stop_tcn_timer(bdata);
}

function acknowledge_topology_change(bdata: NetworkSwitchDataSTP, port: NetworkSwitchPortSTP) {
    port.topology_change_acknowledge = true;
    transmit_config(bdata, port);
}

function send_bpdu(port: NetworkSwitchPort, bpdu: typeof BPDU_C_HEADER | typeof BPDU_TCN_HEADER) {
    port.iface.output({
        buffer: bpdu.getBuffer(),
    }, new BaseAddress(ETHERNET_HEADER.create({
        "dmac": STP_DESTINATION
    }).getBuffer()))
}

function transmit_tcn(bdata: NetworkSwitchDataSTP) {
    let port = bdata.ports[bdata.root_port];
    if (!port) throw "this is what I mean the root port is never set i belive"

    const bpdu = BPDU_TCN_HEADER.create({
        "type": TCN_BPDU_TYPE,
    });

    send_bpdu(port, bpdu);
}

// NOTE: the time is actually encode some kind of way ....
function decode_time(n: number): number { return n };
function encode_time(n: number): number { return n };

function transmit_config(bdata: NetworkSwitchDataSTP, port: NetworkSwitchPortSTP) {

    // ignore hold time this is run in a synchronous environment
    const bpdu = BPDU_C_HEADER.create({
        type: CONFIG_BPDU_TYPE,
        root_id: bdata.designated_root,
        root_path_cost: bdata.root_path_cost,
        bridge_id: bdata.bridge_id,



        max_age: encode_time(bdata.max_age),
        hello_time: encode_time(bdata.hello_time),
        forward_delay: encode_time(bdata.forward_delay),
    });

    if (root_bridge(bdata)) {
        bpdu.set("message_age", 0);
    } else {
        bpdu.set("message_age", 1); // !TODO: message timer should actually count how long it takes to forward the message /* (8.6.1.3.2(f)) */
    }

    let flags = 0;
    if (port.topology_change_acknowledge) flags |= BPDU_FLAG_TOPOLOGY_CHANGE_ACK;
    if (bdata.topology_change) flags |= BPDU_FLAG_TOPOLOGY_CHANGE;

    bpdu.set("flags", flags);

    if (decode_time(bpdu.get("message_age")) < bdata.max_age) {
        port.topology_change_acknowledge = false;
        port.config_pending = false;

        send_bpdu(port, bpdu);
        // hold timer doesn't exist
    }
}

function config_bpdu_generation(bdata: NetworkSwitchDataSTP) {
    for (let port of Object.values(bdata.ports)) {
        if (!validate_port(port)) continue;

        if (designated_port(bdata, port) && (port.state != NetworkSwitchPortState.DISABLED)) {
            transmit_config(bdata, port);
        }
    }
}

function port_state_selection(bdata: NetworkSwitchDataSTP) {
    for (let port of Object.values(bdata.ports)) {
        if (!validate_port(port)) continue;

        if (port.port_id === bdata.root_port) {
            port.config_pending = false;
            port.topology_change_acknowledge = false;
            make_forwarding(bdata, port);
        } else if (designated_port(bdata, port)) {
            stop_message_age_timer(bdata, port);
            make_forwarding(bdata, port);
        } else {
            port.config_pending = false;
            port.topology_change_acknowledge = false;
            make_blocking(bdata, port);
        }
    }
}

function initialize_port(bdata: NetworkSwitchDataSTP, port: NetworkSwitchPort) {
    (<NetworkSwitchPortSTP>port).type = "stp";

    (<NetworkSwitchPortSTP>port).path_cost = DEFAULT_PATH_COST;

    let port_id = port.port_no | (DEFAULT_PORT_PRIORITY & 0xF0) << 8;

    (<NetworkSwitchPortSTP>port).port_id = port_id;
    (<NetworkSwitchPortSTP>port).designated_root = bdata.designated_root;
    (<NetworkSwitchPortSTP>port).designated_cost = bdata.root_path_cost;
    (<NetworkSwitchPortSTP>port).designated_bridge = bdata.bridge_id;
    (<NetworkSwitchPortSTP>port).designated_port = port_id;

    (<NetworkSwitchPortSTP>port).topology_change_acknowledge = false;
    (<NetworkSwitchPortSTP>port).config_pending = false;
    (<NetworkSwitchPortSTP>port).change_detection_enabled = true;

    port.state = NetworkSwitchPortState.BLOCKING;

    if (!validate_port(port)) return;

    stop_message_age_timer(bdata, port);
    stop_forward_delay_timer(bdata, port);
    // stop_hold_timer(bdata, port);
}


function root_selection(bdata: NetworkSwitchDataSTP) {
    let root_port: undefined | NetworkSwitchPortSTP = undefined;

    for (let port of Object.values(bdata.ports)) {
        if (!validate_port(port)) continue;

        if (((!designated_port(bdata, port)) && (port.state != NetworkSwitchPortState.DISABLED) && (port.designated_root < bdata.bridge_id)) &&
            ((!root_port) || (port.designated_root < root_port.designated_root) || (
                (port.designated_root == root_port.designated_root) && (
                    ((port.designated_cost + port.path_cost) < (root_port.designated_cost + root_port.path_cost)) ||
                    (((port.designated_cost + port.path_cost) == (root_port.designated_cost + root_port.path_cost)) &&
                        ((port.designated_bridge < root_port.designated_bridge) || ((port.designated_bridge == root_port.designated_bridge) && (
                            (port.designated_port < root_port.designated_port) || ((port.designated_port == root_port.designated_port) && (
                                port.port_id < root_port.port_id
                            ))
                        ))))
                )
            ))
        ) {
            root_port = port;
        }
    }

    bdata.root_port = root_port?.port_id || 0;

    if (!root_port) {
        bdata.designated_root = bdata.bridge_id;
        bdata.root_path_cost = 0;
    } else {
        bdata.designated_root = root_port.designated_root;
        bdata.root_path_cost = root_port.designated_cost + root_port.path_cost;
    }

}

function become_designated_port(bdata: NetworkSwitchDataSTP, port: NetworkSwitchPortSTP) {
    port.designated_root = bdata.designated_root;
    port.designated_cost = bdata.root_path_cost;
    port.designated_bridge = bdata.bridge_id;
    port.designated_port = port.port_id;
}

function designated_port_selection(bdata: NetworkSwitchDataSTP) {
    for (let port of (Object.values(bdata.ports))) {
        if (!validate_port(port)) continue;

        if (designated_port(bdata, port) || (port.designated_root != bdata.designated_root) || (bdata.root_path_cost < port.designated_cost) || (
            (bdata.root_path_cost == port.designated_cost) && (
                (bdata.bridge_id < port.designated_bridge) || (
                    (bdata.bridge_id == port.designated_bridge) && (port.port_id <= port.designated_port)
                )
            )
        )) {
            become_designated_port(bdata, port);
        }
    }
}

function configuration_update(bdata: NetworkSwitchDataSTP) {
    root_selection(bdata);
    designated_port_selection(bdata);
}

function record_config_information(bdata: NetworkSwitchDataSTP, port: NetworkSwitchPortSTP, config: typeof BPDU_C_HEADER) {
    port.designated_root = config.get("root_id");
    port.designated_cost = config.get("root_path_cost");
    port.designated_bridge = config.get("bridge_id");
    port.designated_port = config.get("port_id");

    start_message_age_timer(bdata, port, decode_time(config.get("message_age")));
}

function record_config_timeout_values(bdata: NetworkSwitchDataSTP, config: typeof BPDU_C_HEADER) {
    bdata.max_age = decode_time(config.get("max_age"));
    bdata.hello_time = decode_time(config.get("hello_time"));
    bdata.forward_delay = decode_time(config.get("forward_delay"));
    bdata.topology_change = !!(config.get("flags") & BPDU_FLAG_TOPOLOGY_CHANGE)
}

export function received_tcn_bpdu(bdata: NetworkSwitchDataSTP, port: NetworkSwitchPortSTP, tcn: typeof BPDU_TCN_HEADER) {
    if (port.state != NetworkSwitchPortState.DISABLED) {
        if (designated_port(bdata, port)) {
            topology_change_detection(bdata);
            acknowledge_topology_change(bdata, port);
        }
    }
}

export function received_config_bpdu(bdata: NetworkSwitchDataSTP, port: NetworkSwitchPortSTP, config: typeof BPDU_C_HEADER) {
    let root = root_bridge(bdata);

    if (port.state != NetworkSwitchPortState.DISABLED) {
        if (supercedes_port_info(bdata, port, config)) {
            record_config_information(bdata, port, config);
            configuration_update(bdata);
            port_state_selection(bdata)

            if ((!root_bridge(bdata)) && root) {
                stop_hello_timer(bdata);

                if (bdata.topology_change_detected) {
                    stop_topology_change_timer(bdata);
                    transmit_tcn(bdata);
                    start_tcn_timer(bdata);
                }
            }

            if (port.port_id == bdata.root_port) {
                record_config_timeout_values(bdata, config);
                config_bpdu_generation(bdata);

                if (config.get("flags") & BPDU_FLAG_TOPOLOGY_CHANGE_ACK) {
                    topology_change_acknowledge(bdata);
                }
            } else if (designated_port(bdata, port)) {
                // Reply
                transmit_config(bdata, port);
            }
        }
    }
}

export function initialization(device: NetworkSwitch) {
    const bdata = device.store.get(NETWORK_SWITCH_STORE_KEY) as NetworkSwitchDataSTP;
    if (!bdata) throw "something went wrong";

    let macaddress = undefined;
    for (let i in bdata.ports) if (bdata.ports[i] instanceof EthernetInterface) {
        macaddress = bdata.ports[i].macAddress;
        break;
    }

    if (!macaddress) throw "something went wrong 2";


    { // Setup the default stp bridge data values
        bdata.bridge_id = create_bridge_identifier(macaddress, DEFAULT_PRIORITY);

        bdata.designated_root = bdata.bridge_id;
        bdata.root_path_cost = 0;
        bdata.root_port = 0;

        bdata.bridge_forward_delay = DEFAULT_FORWARD_DELAY;
        bdata.bridge_hello_time = DEFAULT_HELLO_TIME;
        bdata.bridge_max_age = DEFAULT_MAX_AGE;

        bdata.max_age = bdata.bridge_max_age;
        bdata.hello_time = bdata.bridge_hello_time;
        bdata.forward_delay = bdata.bridge_forward_delay;

        bdata.topology_change = false;
        bdata.topology_change_detected = false;

        bdata.topology_change_time = 0;
        bdata.hold_time = 0;


        bdata.timer_ref_hello = -1;
        bdata.timer_ref_tcn = -1;
        bdata.timer_ref_topology_change = -1;

        bdata.timer_ref_message_age = Object.keys(bdata.ports).reduce<any>((o, k) => { o[parseInt(k)] = -1; return o }, {})
        bdata.timer_ref_forward_delay = Object.keys(bdata.ports).reduce<any>((o, k) => { o[parseInt(k)] = -1; return o }, {})
    }

    stop_tcn_timer(bdata);
    stop_topology_change_timer(bdata);

    // initialize ports
    for (let i in bdata.ports) {
        initialize_port(bdata, bdata.ports[i]);
    }

    port_state_selection(bdata);
    config_bpdu_generation(bdata);
    start_hello_timer(bdata);
}

export function enable_port(bdata: NetworkSwitchDataSTP, port: NetworkSwitchPortSTP) {
    initialize_port(bdata, port);
    port_state_selection(bdata);
}

export function disable_port(bdata: NetworkSwitchDataSTP, port: NetworkSwitchPortSTP) {
    let root = root_bridge(bdata);

    become_designated_port(bdata, port);
    port.state = NetworkSwitchPortState.DISABLED;
    port.topology_change_acknowledge = false;
    port.config_pending = false;
    stop_message_age_timer(bdata, port);
    stop_forward_delay_timer(bdata, port);
    configuration_update(bdata);
    port_state_selection(bdata);

    if ((root_bridge(bdata)) && (!root)) {
        bdata.max_age = bdata.bridge_max_age;
        bdata.hello_time = bdata.bridge_hello_time;
        bdata.forward_delay = bdata.forward_delay;

        topology_change_detection(bdata);
        stop_tcn_timer(bdata);
        config_bpdu_generation(bdata);
        start_hello_timer(bdata);
    }
}

export function set_bridge_priority(bdata: NetworkSwitchDataSTP, new_bid: bigint) {
    let root = root_bridge(bdata);

    for (let port of Object.values(bdata.ports)) {
        if (!validate_port(port)) continue;

        if (designated_port(bdata, port)) {
            port.designated_bridge = new_bid
        }
    }

    if ((root_bridge(bdata)) && (!root)) {
        bdata.max_age = bdata.bridge_max_age;
        bdata.hello_time = bdata.bridge_hello_time;
        bdata.forward_delay = bdata.forward_delay;

        topology_change_detection(bdata);
        stop_tcn_timer(bdata);
        config_bpdu_generation(bdata);
        start_hello_timer(bdata);
    }
}

export function set_port_priority(bdata: NetworkSwitchDataSTP, port: NetworkSwitchPortSTP, new_pid: number) {
    if (designated_port(bdata, port)) {
        port.designated_port = new_pid;
    }

    port.port_id = new_pid;

    if ((bdata.bridge_id == port.designated_bridge) && (port.port_id < port.designated_port)) {
        become_designated_port(bdata, port);
        port_state_selection(bdata);
    }
}

export function set_path_cost(bdata: NetworkSwitchDataSTP, port: NetworkSwitchPortSTP, new_pc: number) {
    port.path_cost = new_pc;
    configuration_update(bdata);
    port_state_selection(bdata);
}

export function enable_change_detection(port: NetworkSwitchPortSTP) {
    port.change_detection_enabled = true;
}
export function disable_change_detection(port: NetworkSwitchPortSTP) {
    port.change_detection_enabled = true;
}


function make_forwarding(bdata: NetworkSwitchDataSTP, port: NetworkSwitchPortSTP) {
    if (port.state === NetworkSwitchPortState.BLOCKING) {
        port.state = NetworkSwitchPortState.LISTENING;
        start_forward_delay_timer(bdata, port);
    }
}

function make_blocking(bdata: NetworkSwitchDataSTP, port: NetworkSwitchPortSTP) {
    if ((port.state != NetworkSwitchPortState.DISABLED) && (port.state != NetworkSwitchPortState.BLOCKING)) {
        if ((port.state == NetworkSwitchPortState.FORWARDING || port.state == NetworkSwitchPortState.LEARNING) && port.change_detection_enabled) {
            topology_change_detection(bdata); // this is obviously going to need a reference to the wider execution context?
        }

        port.state = NetworkSwitchPortState.BLOCKING;
        stop_forward_delay_timer(bdata, port);
    }
}

function hello_timer_expiry(bdata: NetworkSwitchDataSTP) {
    config_bpdu_generation(bdata);
    start_hello_timer(bdata);
}
function start_hello_timer(bdata: NetworkSwitchDataSTP) {
    let device = Object.values(bdata.ports)[0].iface.device;
    device.unschedule(bdata.timer_ref_hello)
    bdata.timer_ref_hello = device.schedule(() => { hello_timer_expiry(bdata) }, bdata.hello_time);
};
function stop_hello_timer(bdata: NetworkSwitchDataSTP) { let device = Object.values(bdata.ports)[0].iface.device; device.unschedule(bdata.timer_ref_hello); };

function tcn_timer_expiry(bdata: NetworkSwitchDataSTP) {
    transmit_tcn(bdata);
    start_tcn_timer(bdata);
}
function start_tcn_timer(bdata: NetworkSwitchDataSTP) {
    let device = Object.values(bdata.ports)[0].iface.device;
    device.unschedule(bdata.timer_ref_tcn)
    bdata.timer_ref_tcn = device.schedule(() => { tcn_timer_expiry(bdata) }, bdata.bridge_hello_time);
};
function stop_tcn_timer(bdata: NetworkSwitchDataSTP) { let device = Object.values(bdata.ports)[0].iface.device; device.unschedule(bdata.timer_ref_tcn); };

function topology_change_expiry(bdata: NetworkSwitchDataSTP) {
    bdata.topology_change_detected = false;
    bdata.topology_change = false;
}
function start_topology_change_timer(bdata: NetworkSwitchDataSTP) {
    let device = Object.values(bdata.ports)[0].iface.device;
    device.unschedule(bdata.timer_ref_topology_change)
    bdata.timer_ref_topology_change = device.schedule(() => { topology_change_expiry(bdata) }, bdata.topology_change_time);
};
function stop_topology_change_timer(bdata: NetworkSwitchDataSTP) { let device = Object.values(bdata.ports)[0].iface.device; device.unschedule(bdata.timer_ref_topology_change) };

function message_age_expiry(bdata: NetworkSwitchDataSTP, port: NetworkSwitchPortSTP) {
    let root = root_bridge(bdata);

    become_designated_port(bdata, port);
    configuration_update(bdata);
    port_state_selection(bdata);

    if ((root_bridge(bdata)) && (!root)) {
        bdata.max_age = bdata.bridge_max_age;
        bdata.hello_time = bdata.bridge_hello_time;
        bdata.forward_delay = bdata.bridge_forward_delay;

        topology_change_detection(bdata);

        stop_tcn_timer(bdata);
        config_bpdu_generation(bdata);
        start_hello_timer(bdata);
    }
}
function start_message_age_timer(bdata: NetworkSwitchDataSTP, port: NetworkSwitchPortSTP, message_age: number) {
    let device = Object.values(bdata.ports)[0].iface.device;
    device.unschedule(bdata.timer_ref_message_age[port.port_id]);
    bdata.timer_ref_message_age[port.port_id] = device.schedule(() => { message_age_expiry(bdata, port) }, message_age);
};
function stop_message_age_timer(bdata: NetworkSwitchDataSTP, port: NetworkSwitchPortSTP) { let device = Object.values(bdata.ports)[0].iface.device; device.unschedule(bdata.timer_ref_message_age[port.port_id]); };

function designated_for_some_port(bdata: NetworkSwitchDataSTP) {
    for (let port of Object.values(bdata.ports)) {
        if (validate_port(port) && (port.designated_bridge == bdata.bridge_id)) {
            return true;
        }
    }

    return false;
}
function forward_delay_expiry(bdata: NetworkSwitchDataSTP, port: NetworkSwitchPortSTP) {
    if (port.state == NetworkSwitchPortState.LISTENING) {
        port.state = NetworkSwitchPortState.LEARNING;
        start_forward_delay_timer(bdata, port);
    } else if (port.state == NetworkSwitchPortState.LEARNING) {
        port.state = NetworkSwitchPortState.FORWARDING;

        if (designated_for_some_port(bdata) && port.change_detection_enabled) {
            topology_change_detection(bdata);
        }
    }
}
function start_forward_delay_timer(bdata: NetworkSwitchDataSTP, port: NetworkSwitchPortSTP) {
    let device = Object.values(bdata.ports)[0].iface.device;
    device.unschedule(bdata.timer_ref_forward_delay[port.port_id]);
    bdata.timer_ref_forward_delay[port.port_id] = device.schedule(() => { forward_delay_expiry(bdata, port) }, bdata.forward_delay);
};
function stop_forward_delay_timer(bdata: NetworkSwitchDataSTP, port: NetworkSwitchPortSTP) { let device = Object.values(bdata.ports)[0].iface.device; device.unschedule(bdata.timer_ref_forward_delay[port.port_id]); };

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