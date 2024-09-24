// Quelling a broadcast storm

import { createSignal, Setter } from "solid-js";
import { IPV4Address } from "../lib/address/ipv4";
import { createMask } from "../lib/address/mask";
import { Device } from "../lib/device/device";
import { EthernetInterface } from "../lib/device/interface";
import { NetworkSwitch } from "../lib/device/network-switch";

const [redundant_connection, set_redundant_connection] = createSignal(true)
function proxy_interface(iface: EthernetInterface, setter?: Setter<boolean>): EthernetInterface {
    if (setter) {
        return new Proxy(iface, {
            set(target, p, newValue, receiver) {
                if (p == "up") {
                    setter(newValue);
                }

                return Reflect.set(target, p, newValue, receiver);
            }
        })
    }

    return iface;
}

let sw1 = new NetworkSwitch(); sw1.name = "SW1"
let sw2 = new NetworkSwitch(); sw2.name = "SW2"
let sw3 = new NetworkSwitch(); sw3.name = "SW3"


let sw1_sw2_iface = sw1.interface_add(proxy_interface(new EthernetInterface(sw1)));
let sw1_sw3_iface = sw1.interface_add(proxy_interface(new EthernetInterface(sw1)));

let sw2_sw1_iface = sw2.interface_add(proxy_interface(new EthernetInterface(sw2)));

// redundant connection master
let sw2_sw3_iface = sw2.interface_add(proxy_interface(new EthernetInterface(sw2), set_redundant_connection));

let sw3_sw1_iface = sw3.interface_add(proxy_interface(new EthernetInterface(sw3)));
let sw3_sw2_iface = sw3.interface_add(proxy_interface(new EthernetInterface(sw3)));

let source_device = new Device(), target_device = new Device(); source_device.name = "Source"; target_device.name = "Target";
let source_iface = source_device.interface_add(proxy_interface(new EthernetInterface(source_device))), target_iface = target_device.interface_add(proxy_interface(new EthernetInterface(target_device)));

let sw1_source_iface = sw1.interface_add(proxy_interface(new EthernetInterface(sw1)));
let sw2_target_iface = sw2.interface_add(proxy_interface(new EthernetInterface(sw2)));

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
    if (sw2_sw3_iface.up) {
        console.log("turning off redundant connection")
        sw2_sw3_iface.up = false;
        sw3_sw2_iface.up = false;
    } else {
        console.log("turning on redundant connection")
        sw2_sw3_iface.up = true;
        sw3_sw2_iface.up = true;
    }
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
    </div>;
}