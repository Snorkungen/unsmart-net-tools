import { Component, createEffect } from "solid-js";
import { createMask } from "../lib/address/mask";
import { IPV4Address } from "../lib/address/ipv4";
import { Device } from "../lib/device/device";
import { BaseInterface, EthernetInterface, LoopbackInterface, VlanInterface, createMacAddress } from "../lib/device/interface";
import { DEVICE_PROGRAM_CLEAR, DEVICE_PROGRAM_DOWNLOAD, DEVICE_PROGRAM_ECHO, DEVICE_PROGRAM_HELP } from "../lib/device/program/program";
import { DAEMON_ECHO_REPLIER } from "../lib/device/program/echo-replier";
import { NetworkSwitch } from "../lib/device/network-switch";
import { DAEMON_ROUTING } from "../lib/device/program/routing";
import { DAEMON_DHCP_SERVER, DHCPServer_Store } from "../lib/device/program/dhcp-server";
import { DEVICE_PROGRAM_DHCP_CLIENT } from "../lib/device/program/dhcp-client";
import Terminal from "../lib/terminal/terminal";
import { DAEMON_SHELL } from "../lib/device/program/shell";
import { DEVICE_PROGRAM_DAEMAN } from "../lib/device/program/daeman";
import { DEVICE_PROGRAM_IFINFO } from "../lib/device/program/ifinfo";
import { DEVICE_PROGRAM_PING } from "../lib/device/program/ping";
import { DEVICE_PROGRAM_ROUTEINFO } from "../lib/device/program/routeinfo";
import { DeviceViewComponent } from "../components/device-view";

let terminal_device: Device | undefined;
let terminal: Terminal;

function attach_device_to_terminal(device: Device) {
    return () => {
        terminal.flush()
        if (terminal_device) {
            terminal_device.terminal_detach();
        }

        device.terminal_attach(terminal);
        let p = device.processes.find(p => p?.id.includes(DAEMON_SHELL.name));
        if (p) {
            device.process_termwriteto(p, new Uint8Array([10])); // press enter
        } else {
            device.process_start(DAEMON_SHELL, []);
        }

        terminal_device = device;
    }
}

const DeviceComponent: Component<{ device: Device }> = ({ device }) => {
    // HACKY BS
    device.process_start(DAEMON_ECHO_REPLIER);
    device.programs.push(
        DEVICE_PROGRAM_PING, DEVICE_PROGRAM_CLEAR, DEVICE_PROGRAM_HELP,
        DEVICE_PROGRAM_ECHO, DEVICE_PROGRAM_DOWNLOAD, DEVICE_PROGRAM_IFINFO, DEVICE_PROGRAM_ROUTEINFO,

        DEVICE_PROGRAM_DAEMAN,
    )

    return <>
        <DeviceViewComponent device={device} on_select={attach_device_to_terminal(device)} />
        <hr />
    </>
}

/* switch an router are on the same device ... */
let r1 = new NetworkSwitch(); r1.name = "R1";
r1.process_start(DAEMON_ROUTING);

let r1_iface_vlan10 = r1.interface_add(new VlanInterface(r1, 10));
r1.interface_set_address(r1_iface_vlan10, new IPV4Address("10.10.0.1"), createMask(IPV4Address, 16));
let r1_iface_vlan20 = r1.interface_add(new VlanInterface(r1, 20));
r1.interface_set_address(r1_iface_vlan20, new IPV4Address("10.20.0.1"), createMask(IPV4Address, 16));


function push_default_gateway(device: Device, iface: BaseInterface, gateway: IPV4Address) {

    device.routes.push({
        destination: new IPV4Address("0.0.0.0"),
        netmask: createMask(IPV4Address, 0),
        gateway: gateway,
        f_gateway: true,
        iface,
    })
}

let server_pc = new Device(); server_pc.name = "SRV 10";
let server_iface_lo = server_pc.interface_add(new LoopbackInterface(server_pc)); server_iface_lo.start();
let server_iface_eth = server_pc.interface_add(new EthernetInterface(server_pc));
server_pc.interface_set_address(server_iface_eth, new IPV4Address("10.10.0.100"), createMask(IPV4Address, 24));

/* push default gateway ... */
push_default_gateway(server_pc, server_iface_eth, new IPV4Address("10.10.0.1"));

let pc1 = new Device(); pc1.name = "PC1";
let pc1_iface = pc1.interface_add(new EthernetInterface(pc1));

let pc2 = new Device(); pc2.name = "PC2";
let pc2_iface = pc2.interface_add(new EthernetInterface(pc2));
pc2.interface_set_address(pc2_iface, new IPV4Address("10.20.0.20"), createMask(IPV4Address, 24));
/* push default gateway ... */
push_default_gateway(pc2, pc2_iface, new IPV4Address("10.20.0.1"));


/* connnect ethernet interfaces ... */
let r1_iface_server = r1.interface_add(new EthernetInterface(r1));
r1_iface_server.vlan = { type: "access", "vids": [10] }
let r1_iface_pc1 = r1.interface_add(new EthernetInterface(r1)); r1_iface_pc1.vlan = { type: "access", "vids": [10] }
let r1_iface_pc2 = r1.interface_add(new EthernetInterface(r1)); r1_iface_pc2.vlan = { type: "access", "vids": [20] }

server_iface_eth.connect(r1_iface_server);
pc1_iface.connect(r1_iface_pc1);
pc2_iface.connect(r1_iface_pc2);

pc1.process_start(DAEMON_ECHO_REPLIER);

// SRV start DHCP server ...
// TODO DHCP support gateway ...
let dhcp_server_config: DHCPServer_Store = {
    parameters: [
        {
            ifid: server_iface_eth.id(),
            version: 4,

            address_range: ["10.10.0.200", "10.10.0.240"],
            gateways: ["10.10.0.1"],
        }
    ]
};
server_pc.store_set(DAEMON_DHCP_SERVER.name, dhcp_server_config);

server_pc.process_start(DAEMON_DHCP_SERVER)

export const TestingComponent: Component = () => {
    createEffect(attach_device_to_terminal(pc1));

    return (
        <div>
            <header>
                <h2>This is a component where trying things are acceptable.</h2>
            </header>
            <div>
                <DeviceComponent device={r1} />
                <DeviceComponent device={server_pc} />
                <DeviceComponent device={pc1} />
                <DeviceComponent device={pc2} />
            </div>
            <div>
                <button onclick={() => pc1.process_start(DEVICE_PROGRAM_DHCP_CLIENT, ["", pc1_iface.id()])} >init dhcp pc1</button>
            </div>
            <hr></hr>
            <div ref={(el) => {
                terminal = new Terminal(el);
                // @ts-ignore
            }}></div>
        </div>
    )
}