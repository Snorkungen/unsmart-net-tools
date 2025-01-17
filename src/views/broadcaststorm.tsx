// Quelling a broadcast storm

import { createSignal, Setter } from "solid-js";
import { IPV4Address } from "../lib/address/ipv4";
import { createMask } from "../lib/address/mask";
import { Contact, Device, ProcessSignal, Program } from "../lib/device/device";
import { BaseInterface, EthernetInterface } from "../lib/device/interface";
import { NetworkSwitch, NetworkSwitchPortState } from "../lib/device/network-switch";
import { uint8_concat, uint8_equals, uint8_fromNumber, uint8_readUint32BE } from "../lib/binary/uint8-array";
import { ETHERNET_HEADER } from "../lib/header/ethernet";
import { MACAddress } from "../lib/address/mac";
import { BaseAddress } from "../lib/address/base";

function network_switch_set_port_state(device: Device, iface: BaseInterface, state: NetworkSwitchPortState) {
    if (!(device instanceof NetworkSwitch)) {
        return;
    }

    device.port_iface_set_state(iface, state);
}

// for switch loop prevention create a program for loop prevention ...
const loop_prevention_dameon: Program = {
    name: "loop_prevention_daemon",
    init(proc, _, data) {
        // send a configuration message or some shit

        let initial_id = uint8_readUint32BE(proc.device.interfaces.filter(iface => iface instanceof EthernetInterface)[0].macAddress.buffer.slice(2));

        let mcast_destination = new MACAddress("01-80-C2-00-00-00");

        let conf = {
            root_id: initial_id,
            root_dist: 0
        }

        function send_inforamtion(id: number, dist: number, rcvif?: EthernetInterface) {
            console.log(proc.device.name, "sending switch information");

            proc.device.interfaces.filter(iface => iface instanceof EthernetInterface).forEach(iface => rcvif != iface && iface.output({
                buffer: uint8_concat([
                    uint8_fromNumber(id, 4),
                    uint8_fromNumber(dist + 1, 4),
                ]),
            }, new BaseAddress(ETHERNET_HEADER.create({ dmac: mcast_destination }).getBuffer())))
        }

        // setup listener ...
        let contact = proc.device.contact_create("RAW", "RAW").data!;
        contact.receive(contact, (_, d) => {
            if (!(d.rcvif instanceof EthernetInterface)) return;

            let ethhdr = ETHERNET_HEADER.from(d.buffer);

            if (!uint8_equals(ethhdr.get("dmac").buffer, mcast_destination.buffer)) return;
            let rid = uint8_readUint32BE(ethhdr.get("payload"), 4);
            let rdist = uint8_readUint32BE(ethhdr.get("payload"), 8);

            if (rid < conf.root_id || (rid == conf.root_id && rdist < conf.root_dist)) {
                conf.root_id = rid;
                conf.root_dist = rdist;

                // send something
                console.log(proc.device.name, conf)
                send_inforamtion(conf.root_id, conf.root_dist, d.rcvif)
            } else if (rid == conf.root_id) {
                console.log("loop detected")
                network_switch_set_port_state(proc.device, d.rcvif, NetworkSwitchPortState.BLOCKING);
            }

            // read payload
        }, { promiscuous: true })

        send_inforamtion(conf.root_id, conf.root_dist);

        return ProcessSignal.__EXPLICIT__;
    }
}

const [redundant_connection, set_redundant_connection] = createSignal(true)

let sw1 = new NetworkSwitch(); sw1.name = "SW1"
let sw2 = new NetworkSwitch(); sw2.name = "SW2"
let sw3 = new NetworkSwitch(); sw3.name = "SW3"


let sw1_sw2_iface = sw1.interface_add(new EthernetInterface(sw1));
let sw1_sw3_iface = sw1.interface_add(new EthernetInterface(sw1));

let sw2_sw1_iface = sw2.interface_add(new EthernetInterface(sw2));

// redundant connection master
let sw2_sw3_iface = sw2.interface_add(new EthernetInterface(sw2));

let sw3_sw1_iface = sw3.interface_add(new EthernetInterface(sw3));
let sw3_sw2_iface = sw3.interface_add(new EthernetInterface(sw3));

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

source_device.interface_set_address(source_iface, source_address, createMask(IPV4Address, 30))
target_device.interface_set_address(target_iface, target_address, createMask(IPV4Address, 30))

function toggle_redundant_link() {
    // imitate the action of a non forwarding port ... 
    // actual program logic would have add support to the switch service
    if (redundant_connection()) {
        console.log("turning off redundant connection")
        network_switch_set_port_state(sw2, sw2_sw3_iface, NetworkSwitchPortState.BLOCKING);
        network_switch_set_port_state(sw3, sw3_sw2_iface, NetworkSwitchPortState.BLOCKING);
    } else {
        console.log("turning on redundant connection")
        network_switch_set_port_state(sw2, sw2_sw3_iface, NetworkSwitchPortState.FORWARDING);
        network_switch_set_port_state(sw3, sw3_sw2_iface, NetworkSwitchPortState.FORWARDING);
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
    target_contact.receiveFrom(target_contact, () => {
        console.log("TARGET RECEIVED MESSAGE")
        target_contact.close(target_contact)
    }, { sport: 100 });

    source_contact.sendTo(source_contact, { buffer: new Uint8Array([1, 0]) }, { dport: 100, daddr: target_address });
    source_contact.close(source_contact);
}

export function BroadcastStorm() {
    toggle_redundant_link()
    return <div>
        <button onclick={toggle_redundant_link}>Turn {redundant_connection() ? "Off 🟥" : "On 🟢"} redundant connection</button>
        <button onclick={initiateStorm}>Act!</button>
        <button onclick={() => {
            sw1.process_start(loop_prevention_dameon)
            sw2.process_start(loop_prevention_dameon)
            sw3.process_start(loop_prevention_dameon)
        }}>test</button>
    </div>;
}