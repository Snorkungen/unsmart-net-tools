import { JSX } from "solid-js/jsx-runtime";
import { IPV4Address } from "../lib/address/ipv4";
import { createMask } from "../lib/address/mask";
import { NetworkSwitch } from "../lib/device/network-switch";
import Terminal from "../lib/terminal/terminal";
import { Device, ProcessSignal } from "../lib/device/device";
import { DAEMON_SHELL } from "../lib/device/program/shell";
import { DAEMON_ECHO_REPLIER } from "../lib/device/program/echo-replier";
import { DEVICE_PROGRAM_CLEAR, DEVICE_PROGRAM_DOWNLOAD, DEVICE_PROGRAM_ECHO, DEVICE_PROGRAM_HELP } from "../lib/device/program/program";
import { DEVICE_PROGRAM_VLANINFO } from "../lib/device/program/vlaninfo";
import { DEVICE_PROGRAM_PING } from "../lib/device/program/ping";
import { DEVICE_PROGRAM_IFINFO } from "../lib/device/program/ifinfo";
import { DAEMON_ROUTING } from "../lib/device/program/routing";
import { EthernetInterface, VlanInterface } from "../lib/device/interface";
import { DEVICE_PROGRAM_ROUTEINFO } from "../lib/device/program/routeinfo";
import { network_map_init_device_shape as network_map_init_device, network_map_init_state, network_map_remove_device_shape as network_map_remove_device, network_map_render } from "../lib/network-map/network-map";
import { createSignal, For, Show, Switch } from "solid-js";

function init_programs(device: Device) {
    device.process_start(DAEMON_ECHO_REPLIER);
    device.programs = [
        DEVICE_PROGRAM_ECHO,
        DEVICE_PROGRAM_IFINFO,
        DEVICE_PROGRAM_ROUTEINFO,
        DEVICE_PROGRAM_VLANINFO,
        DEVICE_PROGRAM_HELP,
        DEVICE_PROGRAM_CLEAR,
        DEVICE_PROGRAM_PING,
        DEVICE_PROGRAM_DOWNLOAD
    ]
}

let networkSwitch = new NetworkSwitch();
let networkSwitch2 = new NetworkSwitch();
networkSwitch.name = "SW1"
networkSwitch2.name = "SW2"

let networkRouter = new NetworkSwitch(); networkRouter.name = "R1"

networkRouter.process_start(DAEMON_ROUTING); // start routing daemon

let rtr_iface = networkRouter.interface_add(new EthernetInterface(networkRouter)); rtr_iface.vlan_set("trunk", 1, 10, 20)
let rtr_vlanif10 = networkRouter.interface_add(new VlanInterface(networkRouter, 10));
let rtr_vlanif20 = networkRouter.interface_add(new VlanInterface(networkRouter, 20));

// configure addresses
networkRouter.interface_address_set(rtr_vlanif10, new IPV4Address("192.168.1.1"), createMask(IPV4Address, 24))
networkRouter.interface_address_set(rtr_vlanif20, new IPV4Address("172.16.0.1"), createMask(IPV4Address, 24))

let swIface_trunk = networkSwitch.interface_add(new EthernetInterface(networkSwitch));
let swIface2_trunk = networkSwitch2.interface_add(new EthernetInterface(networkSwitch2));

let swIface_trunk_rtr = networkSwitch.interface_add(new EthernetInterface(networkSwitch));

swIface_trunk.connect(swIface2_trunk);

let swIface_pc1 = networkSwitch.interface_add(new EthernetInterface(networkSwitch));
let swIface_pc2 = networkSwitch.interface_add(new EthernetInterface(networkSwitch));
let swIface_pc3 = networkSwitch.interface_add(new EthernetInterface(networkSwitch));

let swIface2_pc4 = networkSwitch2.interface_add(new EthernetInterface(networkSwitch2));
let swIface2_pc5 = networkSwitch2.interface_add(new EthernetInterface(networkSwitch2));

let vlan10: EthernetInterface["vlan"] = {
    type: "access",
    vids: [10]
}, vlan20: EthernetInterface["vlan"] = {
    type: "access",
    vids: [20]
}, vlanTrunk: EthernetInterface["vlan"] = {
    type: "trunk",
    vids: [1, /*10,*/ 20]
}

swIface_pc1.vlan = vlan10;
swIface_pc2.vlan = vlan10;
swIface_pc3.vlan = vlan10;

// vlan test
swIface2_pc4.vlan = vlan20;
swIface2_pc5.vlan = vlan20;

swIface_trunk.vlan = vlanTrunk;
swIface2_trunk.vlan = vlanTrunk;


swIface_trunk_rtr.vlan_set("trunk", 1, 10, 20);
swIface_trunk_rtr.connect(rtr_iface)

let pc1 = new Device(); pc1.name = "PC1";
let pc2 = new Device(); pc2.name = "PC2";
let pc3 = new Device(); pc3.name = "PC3";

// vlan test
let pc4 = new Device(); pc4.name = "PC4";
let pc5 = new Device(); pc5.name = "PC5";

let iface_pc1 = pc1.interface_add(new EthernetInterface(pc1));
let iface_pc2 = pc2.interface_add(new EthernetInterface(pc2));
let iface_pc3 = pc3.interface_add(new EthernetInterface(pc3));

// vlan test
let iface_pc4 = pc4.interface_add(new EthernetInterface(pc4));
let iface_pc5 = pc5.interface_add(new EthernetInterface(pc5));

pc1.interface_address_set(iface_pc1, new IPV4Address("192.168.1.10"), createMask(IPV4Address, 24))
pc2.interface_address_set(iface_pc2, new IPV4Address("192.168.1.20"), createMask(IPV4Address, 24))

// add default routes
pc1.routes.push({ destination: new IPV4Address("0.0.0.0"), netmask: createMask(IPV4Address, 0), gateway: new IPV4Address("192.168.1.1"), iface: iface_pc1, f_gateway: true })
pc2.routes.push({ destination: new IPV4Address("0.0.0.0"), netmask: createMask(IPV4Address, 0), gateway: new IPV4Address("192.168.1.1"), iface: iface_pc2, f_gateway: true })

pc4.interface_address_set(iface_pc4, new IPV4Address("172.16.0.40"), createMask(IPV4Address, 24))
pc5.interface_address_set(iface_pc5, new IPV4Address("172.16.0.50"), createMask(IPV4Address, 24))

// add default routes
pc4.routes.push({ destination: new IPV4Address("0.0.0.0"), netmask: createMask(IPV4Address, 0), gateway: new IPV4Address("172.16.0.1"), iface: iface_pc4, f_gateway: true })
pc5.routes.push({ destination: new IPV4Address("0.0.0.0"), netmask: createMask(IPV4Address, 0), gateway: new IPV4Address("172.16.0.1"), iface: iface_pc5, f_gateway: true })

swIface_pc1.connect(iface_pc1);
swIface_pc2.connect(iface_pc2);
swIface_pc3.connect(iface_pc3);
swIface2_pc4.connect(iface_pc4);

swIface2_pc5.connect(iface_pc5)

init_programs(networkSwitch)
init_programs(networkSwitch2)
init_programs(networkRouter)
init_programs(pc1)
init_programs(pc2)
init_programs(pc3)
init_programs(pc4)
init_programs(pc5)

const switch_dimensions = { width: 85, height: 25 }
let terminalOwner: Device | undefined = pc1;
let terminal: Terminal;

const [is_in_iface_connection_mode, set_is_in_iface_connection_mode] = createSignal(false);
const [active_device, set_active_device] = createSignal<undefined | Device>(undefined, { equals: false });

let selected_iface: EthernetInterface | undefined = undefined;

let state: undefined | ReturnType<typeof network_map_init_state> = undefined;

function init_nmap(el: SVGSVGElement) {
    state = network_map_init_state(el);

    network_map_init_device(state, networkSwitch, 50, 50, switch_dimensions);

    network_map_init_device(state, pc1, 150, 50);
    network_map_init_device(state, pc2, 220, 50);
    network_map_init_device(state, pc3, 290, 50);

    network_map_init_device(state, networkRouter, 100, 270, switch_dimensions);

    network_map_init_device(state, pc4, 220, 350);
    network_map_init_device(state, pc5, 290, 350);
    network_map_init_device(state, networkSwitch2, 100, 350, switch_dimensions);

    network_map_render(state);

    state.onclick = (dev, iface) => {
        if (!(dev instanceof Device) || !state) {
            return;
        }

        if (iface instanceof EthernetInterface && is_in_iface_connection_mode()) {
            if (selected_iface) {
                if (selected_iface == iface) {
                    iface.disconnect();
                } else {
                    selected_iface.connect(iface);
                }

                selected_iface = undefined;
                return;
            }

            selected_iface = iface;
            return;
        }

        terminalOwner?.terminal_detach()
        terminalOwner = dev;
        terminalOwner.terminal_attach(terminal);
        let proc = terminalOwner.processes.find(p => p && p.id.includes(DAEMON_SHELL.name))
        if (!proc) {
            terminalOwner.process_start(DAEMON_SHELL);
        } else {
            proc.device.process_termwriteto(proc, new Uint8Array([10])); // press enter
        }
        set_active_device(terminalOwner)
    }
}

function add_device_to_nmap(device: Device) {
    // for the vibes just shove the device smack dab in the middle of the current view
    if (!state) throw new Error("state not initialized");

    let x = (state.container.clientWidth / 2) + state.origin.x;
    let y = (state.container.clientHeight / 2) - state.origin.y;

    let dimen = undefined;

    if (device instanceof NetworkSwitch) {
        dimen = switch_dimensions;
    }

    network_map_init_device(state, device, x, y, dimen);
    network_map_render(state);
}

function handle_add_device_submit(e: SubmitEvent & { currentTarget: HTMLFormElement; }) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    let dname = fd.get("form_add_device_dname")!.toString();
    let if_count = parseInt(fd.get("form_add_device_ifcount")!.toString());
    let devtype = fd.get("form_add_device_devtype")!.toString()

    let device: Device;
    // !TODO: allow for the creation of a router, eithe switch or device based
    if (devtype == "switch") {
        device = new NetworkSwitch();
    } else {
        device = new Device();
    }

    device.name = dname;

    for (let i = 0; i < if_count; i++) {
        device.interface_add(new EthernetInterface(device));
    }

    init_programs(device);
    add_device_to_nmap(device);
}

function add_interface_to_device(device: Device) {
    if (!state) return;
    device.interface_add(new EthernetInterface(device));
    network_map_render(state);
    set_active_device(device);
}

function remove_interface_from_device(device: Device, iface: EthernetInterface) {
    if (!state) return;
    device.interface_remove(iface);
    network_map_render(state);
    set_active_device(device);
}

function remove_device_from_state(device: Device) {
    if (!state) return;
    network_map_remove_device(state, device);
    
    device.terminal_detach();
    terminalOwner = undefined;
    set_active_device(undefined);
    
    network_map_render(state);
}

export default function NetworkMapViewer(): JSX.Element {
    return <div style={{ width: "100%" }} >
        <div style={{ display: "flex" }}>
            <svg width={"100%"} height={500} ref={init_nmap}></svg>
            <div style={{ width: "24em", height: "100%", padding: "2em" }}>
                {/* Shove random things into here */}
                <nav>
                    <button onclick={() => set_is_in_iface_connection_mode(v => !v)} class="btn btn-primary">toggle {is_in_iface_connection_mode() ? "⏸️" : "▶️"}</button>
                    <button class="btn btn-primary mx-3" on:click={() => set_active_device(undefined)}>Add</button>
                </nav>
                <div>
                    <Show when={!!active_device()} fallback={
                        <form onSubmit={handle_add_device_submit}>
                            <fieldset>
                                <legend>Add a device</legend>
                                <div class="mb-3 form-check form-check-inline">
                                    <input class="form-check-input" type="radio" name="form_add_device_devtype" id="form_add_device_devtype_regular" value="regular" checked />
                                    <label class="form-check-label" for="form_add_device_devtype_regular">Regular</label>
                                </div>
                                <div class="mb-3 form-check form-check-inline">
                                    <input class="form-check-input" type="radio" name="form_add_device_devtype" id="form_add_device_devtype_switch" value="switch" />
                                    <label class="form-check-label" for="form_add_device_devtype_switch">Switch</label>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label" for="form_add_device_dname">Device Name</label>
                                    <input class="form-control" type="text" name="form_add_device_dname" id="form_add_device_dname" required />
                                </div>
                                <div class="mb-3">
                                    <label class="form-label" for="form_add_device_ifcount">Ether if count</label>
                                    <input class="form-control" type="number" min={0} value={1} name="form_add_device_ifcount" id="form_add_device_ifcount" required />
                                </div>
                                <div class="col-auto">
                                    <button class="btn btn-secondary" type="submit">Create</button>
                                </div>
                            </fieldset>
                        </form>

                    }>
                        <div class="text-center">
                            <div onclick={() => active_device() && remove_device_from_state(active_device()!)} class="mb-5">
                                <h1>{active_device()!.name}</h1>
                                <button class="btn btn-danger">Remove Device</button>

                            </div>
                            <For each={active_device()!.interfaces.filter(iface => iface instanceof EthernetInterface)}>
                                {(item) => (
                                    <div class="row text-center mb-3">
                                        <span class="col">{item.id()}</span>
                                        <button class="col btn btn-danger" onClick={() => active_device() && remove_interface_from_device(active_device()!, item)}>-</button>
                                    </div>
                                )}
                            </For>
                            <div class="row text-center">
                                <span class="col">Add</span>
                                <button class="col btn btn-primary" onClick={() => active_device() && add_interface_to_device(active_device()!)}>+</button>
                            </div>
                        </div></Show>
                </div>
            </div>
        </div>

        <div ref={(el) => {
            terminal = new Terminal(el);
            terminalOwner?.terminal_attach(terminal);
            terminalOwner?.process_start(DAEMON_SHELL);
        }}></div>
    </div>
};

