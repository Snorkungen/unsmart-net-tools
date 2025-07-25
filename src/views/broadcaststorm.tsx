// Quelling a broadcast storm

import { createSignal } from "solid-js";
import { IPV4Address } from "../lib/address/ipv4";
import { createMask } from "../lib/address/mask";
import { Device, Process, ProcessSignal } from "../lib/device/device";
import { BaseInterface, EthernetInterface } from "../lib/device/interface";
import { network_switch_get_ports, NETWORK_SWITCH_PORTS_STORE_KEY, NETWORK_SWITCH_STP_DAEMON, NetworkSwitch, NetworkSwitchPortState } from "../lib/device/network-switch";
import { DAEMON_STP_SERVER, DAEMON_STP_SERVER_STATE_STORE_KEY, stp_disable_port, stp_enable_port } from "../lib/device/program/stp-server";

const [redundant_connection, set_redundant_connection] = createSignal(true)

let sw1 = new NetworkSwitch(); sw1.name = "SW1"
let sw2 = new NetworkSwitch(); sw2.name = "SW2"
let sw3 = new NetworkSwitch(); sw3.name = "SW3"
let sw4 = new NetworkSwitch(); sw4.name = "SW4"


let sw1_sw2_iface = sw1.interface_add(new EthernetInterface(sw1));
let sw1_sw3_iface = sw1.interface_add(new EthernetInterface(sw1));

let sw2_sw1_iface = sw2.interface_add(new EthernetInterface(sw2));

// redundant connection master
let sw2_sw3_iface = sw2.interface_add(new EthernetInterface(sw2));

let sw3_sw1_iface = sw3.interface_add(new EthernetInterface(sw3));
let sw3_sw2_iface = sw3.interface_add(new EthernetInterface(sw3));

let sw3_sw4_iface = sw3.interface_add(new EthernetInterface(sw3))
let sw4_sw3_iface = sw4.interface_add(new EthernetInterface(sw4))

sw3_sw4_iface.connect(sw4_sw3_iface)

let source_device = new Device(), target_device = new Device(); source_device.name = "Source"; target_device.name = "Target";
let source_iface = source_device.interface_add(new EthernetInterface(source_device)), target_iface = target_device.interface_add(new EthernetInterface(target_device));

let sw1_source_iface = sw1.interface_add(new EthernetInterface(sw1));
let sw2_target_iface = sw2.interface_add(new EthernetInterface(sw2));

sw1_sw2_iface.connect(sw2_sw1_iface);
sw1_sw3_iface.connect(sw3_sw1_iface);
sw2_sw3_iface.connect(sw3_sw2_iface);

source_iface.connect(sw1_source_iface);
target_iface.connect(sw2_target_iface);

const source_address = new IPV4Address("10.10.10.1");
const target_address = new IPV4Address("10.10.10.2");

source_device.interface_address_set(source_iface, source_address, createMask(IPV4Address, 30))
target_device.interface_address_set(target_iface, target_address, createMask(IPV4Address, 30))

function toggle_redundant_link() {
    // imitate the action of a non forwarding port ... 
    // actual program logic would have add support to the switch service
    let sw2_sw3_port = Object.values(network_switch_get_ports(sw2)).find(p => p && p.iface == sw2_sw3_iface)!;
    if (redundant_connection()) {
        console.log("turning off redundant connection")

        stp_disable_port(sw2, sw2_sw3_port);
    } else {
        console.log("turning on redundant connection")
        stp_enable_port(sw2, sw2_sw3_port);
    }

    set_redundant_connection(v => !v);
}

function initiateStorm() {
    // clear the arp caches
    source_device.arp_cache.clear();
    target_device.arp_cache.clear();

    // pre fill arp entry to target
    source_device.arp_cache.set(target_address.toString(), {
        neighbor: target_address,
        iface: source_iface,
        macAddress: target_iface.macAddress,
        createdAt: -1
    })

    // send an upd packet ...
    let source_contact = source_device.contact_create("IPv4", "UDP").data!;

    let target_contact = target_device.contact_create("IPv4", "UDP").data!;
    target_contact.receiveFrom(() => {
        console.log("TARGET RECEIVED MESSAGE")
        alert("received message")
        target_contact.close()
    }, { sport: 100 });

    source_contact.sendTo({ buffer: new Uint8Array([1, 0]) }, { dport: 100, daddr: target_address });
    source_contact.close();
}

export function BroadcastStorm() {
    toggle_redundant_link()

    return <div>
        <button onclick={toggle_redundant_link}>Turn {redundant_connection() ? "Off 🟥" : "On 🟢"} redundant connection</button>
        <button onclick={initiateStorm}>Act!</button>
        <button onclick={() => {
            sw1.process_start(DAEMON_STP_SERVER)
            sw2.process_start(DAEMON_STP_SERVER)
            sw3.process_start(DAEMON_STP_SERVER)
            sw4.process_start(DAEMON_STP_SERVER)
        }}>Start</button>
        <button onclick={() => {
            let p = sw1.processes.items.find(p => p?.program.name === DAEMON_STP_SERVER.name); (p) && p.close(ProcessSignal.INTERRUPT);
            p = sw2.processes.items.find(p => p?.program.name === DAEMON_STP_SERVER.name); (p) && p.close(ProcessSignal.INTERRUPT);
            p = sw3.processes.items.find(p => p?.program.name === DAEMON_STP_SERVER.name); (p) && p.close(ProcessSignal.INTERRUPT);
        }}>Stop</button>
        <button onclick={() => {
            // get the   informations ...
            console.log(sw1.store_get(DAEMON_STP_SERVER_STATE_STORE_KEY), sw1.store_get(NETWORK_SWITCH_PORTS_STORE_KEY));
            console.log(sw2.store_get(DAEMON_STP_SERVER_STATE_STORE_KEY), sw2.store_get(NETWORK_SWITCH_PORTS_STORE_KEY));
            console.log(sw3.store_get(DAEMON_STP_SERVER_STATE_STORE_KEY), sw3.store_get(NETWORK_SWITCH_PORTS_STORE_KEY));
            console.log(sw4.store_get(DAEMON_STP_SERVER_STATE_STORE_KEY), sw4.store_get(NETWORK_SWITCH_PORTS_STORE_KEY));

        }}  >dump</button>
    </div>;
}