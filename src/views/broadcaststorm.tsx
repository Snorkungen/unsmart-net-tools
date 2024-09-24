// Quelling a broadcast storm

import { IPV4Address } from "../lib/address/ipv4";
import { MACAddress } from "../lib/address/mac";
import { createMask } from "../lib/address/mask";
import { Device } from "../lib/device/device";
import { EthernetInterface } from "../lib/device/interface";
import { NetworkSwitch } from "../lib/device/network-switch";


let sw1 = new NetworkSwitch();
let sw2 = new NetworkSwitch();
let sw3 = new NetworkSwitch();


let sw1_sw2_iface = sw1.interface_add(new EthernetInterface(sw1));
let sw1_sw3_iface = sw1.interface_add(new EthernetInterface(sw1));

let sw2_sw1_iface = sw2.interface_add(new EthernetInterface(sw2));
let sw2_sw3_iface = sw2.interface_add(new EthernetInterface(sw2));

let sw3_sw1_iface = sw3.interface_add(new EthernetInterface(sw3));
let sw3_sw2_iface = sw3.interface_add(new EthernetInterface(sw3));

let source_device = new Device(), target_device = new Device();
let source_iface = source_device.interface_add(new EthernetInterface(source_device)), target_iface = target_device.interface_add(new EthernetInterface(target_device));

let sw1_source_iface = sw1.interface_add(new EthernetInterface(sw1));
let sw2_target_iface = sw2.interface_add(new EthernetInterface(sw2));

sw1_sw2_iface.connect(sw2_sw1_iface);
sw1_sw3_iface.connect(sw3_sw1_iface);

source_iface.connect(sw1_source_iface);
target_iface.connect(sw2_target_iface);

const source_address = new IPV4Address("10.10.10.1");
const target_address = new IPV4Address("10.10.10.3");

source_device.interface_set_address(source_iface, source_address, createMask(IPV4Address, 30))
target_device.interface_set_address(target_iface, target_address, createMask(IPV4Address, 30))

function connect_redundant_link() {
    // connect the redundant switch
    if (!sw2_sw3_iface.up) {
        sw2_sw3_iface.connect(sw3_sw2_iface);
    }
}

function initiateStorm() {

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

    return <div>
        <button onclick={connect_redundant_link}>connect the redundant connection</button>
        <button onclick={initiateStorm}>Act!</button>
    </div>;
}