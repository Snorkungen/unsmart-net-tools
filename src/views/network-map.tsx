import { JSX } from "solid-js/jsx-runtime";
import { IPV4Address } from "../lib/address/ipv4";
import { createMask } from "../lib/address/mask";
import { NetworkSwitch } from "../lib/device/network-switch";
import Terminal from "../lib/terminal/terminal";
import { Device } from "../lib/device/device";
import { DAEMON_SHELL } from "../lib/device/program/shell";
import { DAEMON_ECHO_REPLIER } from "../lib/device/program/echo-replier";
import { DEVICE_PROGRAM_CLEAR, DEVICE_PROGRAM_DOWNLOAD, DEVICE_PROGRAM_ECHO, DEVICE_PROGRAM_HELP } from "../lib/device/program/program";
import { DEVICE_PROGRAM_VLANINFO } from "../lib/device/program/vlaninfo";
import { DEVICE_PROGRAM_PING } from "../lib/device/program/ping";
import { DEVICE_PROGRAM_IFINFO } from "../lib/device/program/ifinfo";
import { DAEMON_ROUTING, DEVICE_PROGRAM_ROUTINGMAN } from "../lib/device/program/routing";
import { EthernetInterface, VlanInterface } from "../lib/device/interface";
import { DEVICE_PROGRAM_ROUTEINFO } from "../lib/device/program/routeinfo";
import { network_map_init_device_shape as network_map_init_device, network_map_init_state, network_map_remove_device_shape as network_map_remove_device, network_map_render } from "../lib/network-map/network-map";
import { createSignal, For, Show } from "solid-js";
import { DEVICE_PROGRAM_TRACEROUTE } from "../lib/device/program/traceroute";
import { DEVICE_PROGRAM_HOSTSINFO, setaddress_by_host } from "../lib/device/program/hostsinfo";
import { DEVICE_PROGRAM_DHCP_SERVER_MAN } from "../lib/device/program/dhcp-server-man";
import { DEVICE_PROGRAM_DHCP_CLIENT } from "../lib/device/program/dhcp-client";
import { deserialize_NetworkMap, serialize_NetworkMap } from "../lib/network-map/serialize";
import { DEVICE_PROGRAM_SWPORTINFO } from "../lib/device/program/swportinfo";
import { DEVICE_PROGRAM_DAEMAN } from "../lib/device/program/daeman";

function init_programs(device: Device) {
    device.process_start(DAEMON_ECHO_REPLIER);
    device.programs.push(
        DEVICE_PROGRAM_ECHO,
        DEVICE_PROGRAM_IFINFO,
        DEVICE_PROGRAM_ROUTEINFO,
        DEVICE_PROGRAM_VLANINFO,
        DEVICE_PROGRAM_HELP,
        DEVICE_PROGRAM_CLEAR,
        DEVICE_PROGRAM_PING,
        DEVICE_PROGRAM_DOWNLOAD,
        DEVICE_PROGRAM_TRACEROUTE,
        DEVICE_PROGRAM_HOSTSINFO,
        DEVICE_PROGRAM_ROUTINGMAN,
        DEVICE_PROGRAM_DAEMAN
    );

    if (device instanceof NetworkSwitch) {
        device.programs.push(DEVICE_PROGRAM_SWPORTINFO)
    }
}

let networkSwitch = new NetworkSwitch();
let networkSwitch2 = new NetworkSwitch();
networkSwitch.name = "SW1"
networkSwitch2.name = "SW2"

let networkRouter = new NetworkSwitch(); networkRouter.name = "R1"
networkRouter.process_start(DAEMON_ROUTING); // start routing daemon

networkRouter.programs.push(DEVICE_PROGRAM_DHCP_SERVER_MAN)

let rtr_iface = networkRouter.interface_add(new EthernetInterface(networkRouter)); rtr_iface.vlan_set("hybrid", 1, 10, 20)
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

swIface_pc1.vlan_set("access", 10);
swIface_pc2.vlan_set("access", 10);
swIface_pc3.vlan_set("access", 10);

// vlan test
swIface2_pc4.vlan_set("access", 20);
swIface2_pc5.vlan_set("access", 20);

swIface_trunk.vlan_set("hybrid", 1, 20);
swIface2_trunk.vlan_set("hybrid", 1, 20);


swIface_trunk_rtr.vlan_set("hybrid", 1, 10, 20);
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
pc1.interface_route_set(iface_pc1, new IPV4Address("0.0.0.0"), createMask(IPV4Address, 0), new IPV4Address("192.168.1.1"))
pc2.interface_route_set(iface_pc2, new IPV4Address("0.0.0.0"), createMask(IPV4Address, 0), new IPV4Address("192.168.1.1"))

pc4.interface_address_set(iface_pc4, new IPV4Address("172.16.0.40"), createMask(IPV4Address, 24))
pc5.interface_address_set(iface_pc5, new IPV4Address("172.16.0.50"), createMask(IPV4Address, 24))

// add default routes
pc4.interface_route_set(iface_pc4, new IPV4Address("0.0.0.0"), createMask(IPV4Address, 0), new IPV4Address("172.16.0.1"))
pc5.interface_route_set(iface_pc5, new IPV4Address("0.0.0.0"), createMask(IPV4Address, 0), new IPV4Address("172.16.0.1"))

swIface_pc1.connect(iface_pc1);
swIface_pc2.connect(iface_pc2);
swIface_pc3.connect(iface_pc3);
swIface2_pc4.connect(iface_pc4);

swIface2_pc5.connect(iface_pc5)

// DHCP test
pc3.programs.push(DEVICE_PROGRAM_DHCP_CLIENT);

init_programs(networkSwitch)
init_programs(networkSwitch2)
init_programs(networkRouter)
init_programs(pc1)
init_programs(pc2)
init_programs(pc3)
init_programs(pc4)
init_programs(pc5)

function bulk_set_addresses(host: string, ...addresses: IPV4Address[]) {
    setaddress_by_host(pc1, host, ...addresses);
    setaddress_by_host(pc2, host, ...addresses);
    setaddress_by_host(networkRouter, host, ...addresses);
    setaddress_by_host(pc4, host, ...addresses);
    setaddress_by_host(pc5, host, ...addresses);
};

bulk_set_addresses("pc1", new IPV4Address("192.168.1.10"))
bulk_set_addresses("pc2", new IPV4Address("192.168.1.20"))
bulk_set_addresses("r1", new IPV4Address("192.168.1.1"), new IPV4Address("172.16.0.1"))
bulk_set_addresses("pc4", new IPV4Address("172.16.0.40"))
bulk_set_addresses("pc5", new IPV4Address("172.16.0.50"))

const switch_dimensions = { width: 85, height: 25 }
let terminalOwner: Device | undefined = pc1;
let terminal: Terminal;

const [is_in_iface_connection_mode, set_is_in_iface_connection_mode] = createSignal(false);
const [active_device, set_active_device] = createSignal<undefined | Device>(undefined, { equals: false });

let selected_iface: EthernetInterface | undefined = undefined;

let state: undefined | ReturnType<typeof network_map_init_state> = undefined;

function handle_nmap_click(...[dev, iface]: object[]) {
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
    let proc = terminalOwner.processes.items.find(p => p && p.id.includes(DAEMON_SHELL.name))
    if (!proc) {
        terminalOwner.process_start(DAEMON_SHELL);
    } else {
        proc.io.read(new Uint8Array([10])); // Press enter
    }
    set_active_device(terminalOwner)
}

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

    state.onclick = handle_nmap_click;
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
    // network_map_render(state); // !NOTE: refresh interfaces hook calls render
    set_active_device(device);
}

function remove_interface_from_device(device: Device, iface: EthernetInterface) {
    if (!state) return;
    device.interface_remove(iface);
    // network_map_render(state); // !NOTE: refresh interfaces hook calls render
    set_active_device(device);
}

function remove_device_from_state(device: Device) {
    if (!state) return;
    network_map_remove_device(state, device);

    device.terminal_detach();
    device.processes.close();
    // @ts-expect-error
    device.contacts.close();
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
                    <div>
                        <button class="btn btn-primary" onclick={() => {
                            if (!state) return;
                            let s_nmap = serialize_NetworkMap(state);
                            window.sessionStorage.setItem("__dump_state__", JSON.stringify(s_nmap))
                        }}>Dump</button>
                        <button class="btn btn-secondary" onclick={() => {
                            let v = window.sessionStorage.getItem("__dump_state__");
                            if (!v || !state) return;

                            for (let shape of state.shapes) {
                                if (shape.type != "shape" || !(shape.assob instanceof Device)) {
                                    continue;
                                }
                                remove_device_from_state(shape.assob)
                            }

                            state = deserialize_NetworkMap(state.container, JSON.parse(v));
                            state.onclick = handle_nmap_click;
                            network_map_render(state)
                        }}>Recover</button>
                    </div>

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
                            <div class="mb-5">
                                <h1>{active_device()!.name}</h1>
                                <button class="btn btn-danger" onclick={() => active_device() && remove_device_from_state(active_device()!)}>Remove Device</button>
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

