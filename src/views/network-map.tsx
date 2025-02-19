import { JSX } from "solid-js/jsx-runtime";
import { IPV4Address } from "../lib/address/ipv4";
import { createMask } from "../lib/address/mask";
import { NetworkSwitch } from "../lib/device/network-switch";
import Terminal from "../lib/terminal/terminal";
import { Device, ProcessSignal } from "../lib/device/device";
import { DAEMON_SHELL } from "../lib/device/program/shell";
import { DAEMON_ECHO_REPLIER } from "../lib/device/program/echo-replier";
import { DEVICE_PROGRAM_CLEAR, DEVICE_PROGRAM_DOWNLOAD, DEVICE_PROGRAM_ECHO, DEVICE_PROGRAM_HELP } from "../lib/device/program/program";
import { DEVICE_PROGRAM_PING } from "../lib/device/program/ping";
import { DEVICE_PROGRAM_IFINFO } from "../lib/device/program/ifinfo";
import { DAEMON_ROUTING } from "../lib/device/program/routing";
import { EthernetInterface, VlanInterface } from "../lib/device/interface";
import { DEVICE_PROGRAM_ROUTEINFO } from "../lib/device/program/routeinfo";
import { NMDevice, NetworkMap } from "../components/network-map";


const INTERFACE_ANIM_DELAY = 550;

function init_programs(device: Device) {
    device.process_start(DAEMON_ECHO_REPLIER);
    device.programs = [
        DEVICE_PROGRAM_ECHO,
        DEVICE_PROGRAM_IFINFO,
        DEVICE_PROGRAM_ROUTEINFO,
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
networkRouter.interface_set_address(rtr_vlanif10, new IPV4Address("192.168.1.1"), createMask(IPV4Address, 24))
networkRouter.interface_set_address(rtr_vlanif20, new IPV4Address("172.16.0.1"), createMask(IPV4Address, 24))


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

pc1.interface_set_address(iface_pc1, new IPV4Address("192.168.1.10"), createMask(IPV4Address, 24))
pc2.interface_set_address(iface_pc2, new IPV4Address("192.168.1.20"), createMask(IPV4Address, 24))

// add default routes
pc1.routes.push({ destination: new IPV4Address("0.0.0.0"), netmask: createMask(IPV4Address, 0), gateway: new IPV4Address("192.168.1.1"), iface: iface_pc1, f_gateway: true })
pc2.routes.push({ destination: new IPV4Address("0.0.0.0"), netmask: createMask(IPV4Address, 0), gateway: new IPV4Address("192.168.1.1"), iface: iface_pc2, f_gateway: true })

pc4.interface_set_address(iface_pc4, new IPV4Address("172.16.0.40"), createMask(IPV4Address, 24))
pc5.interface_set_address(iface_pc5, new IPV4Address("172.16.0.50"), createMask(IPV4Address, 24))

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

let nmDevice_sw = new NMDevice(50, 50, networkSwitch, switch_dimensions);
let nmDevice_pc1 = new NMDevice(150, 50, pc1);
let nmDevice_pc2 = new NMDevice(220, 50, pc2);
let nmDevice_pc3 = new NMDevice(290, 50, pc3);

let nmDevice_rtr = new NMDevice(100, 270, networkRouter, switch_dimensions);

let nmDevice_pc4 = new NMDevice(220, 350, pc4);
let nmDevice_pc5 = new NMDevice(290, 350, pc5);
let nmDevice_sw2 = new NMDevice(100, 350, networkSwitch2, switch_dimensions);

let terminalOwner = pc1;
let terminal: Terminal;

function add_device_to_nmap(nmap: NetworkMap, ndev: NMDevice) {
    nmap.entities.push(ndev)

    ndev.onclick = () => {
        terminalOwner.terminal_detach()
        terminalOwner = ndev.device;
        terminalOwner.terminal_attach(terminal);
        let proc = terminalOwner.processes.find(p => p && p.id.includes(DAEMON_SHELL.name))
        if (!proc) {
            terminalOwner.process_start(DAEMON_SHELL);
        } else {
            proc.device.process_termwriteto(proc, new Uint8Array([10])); // press enter
        }
    }

    ndev.device.interfaces.forEach(f => {
        if (f instanceof EthernetInterface) {
            f.receive_delay = INTERFACE_ANIM_DELAY
        }
    })

    nmap.update()
}

export default function NetworkMapViewer(): JSX.Element {
    let nmap = new NetworkMap();
    add_device_to_nmap(nmap, nmDevice_pc1)
    add_device_to_nmap(nmap, nmDevice_pc2)
    add_device_to_nmap(nmap, nmDevice_pc3)
    add_device_to_nmap(nmap, nmDevice_sw)

    // vlan test
    add_device_to_nmap(nmap, nmDevice_pc4)
    add_device_to_nmap(nmap, nmDevice_pc5)
    add_device_to_nmap(nmap, nmDevice_sw2)
    add_device_to_nmap(nmap, nmDevice_rtr)

    return <div style={{ width: "100%" }} >

        <svg width={"100%"} height={500} ref={(el => { nmap.set_container(el) })}>
        </svg>

        <div ref={(el) => {
            terminal = new Terminal(el);
            terminalOwner.terminal_attach(terminal);
            terminalOwner.process_start(DAEMON_SHELL);
        }}></div>
    </div>
};

