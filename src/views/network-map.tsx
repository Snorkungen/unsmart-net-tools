import { JSX } from "solid-js/jsx-runtime";
import { IPV4Address } from "../lib/address/ipv4";
import { createMask } from "../lib/address/mask";
import { NetworkSwitch2 } from "../lib/device/network-switch";
import Terminal from "../lib/terminal/terminal";
import { Device2, EthernetInterface } from "../lib/device/device2";
import { DAEMON_SHELL } from "../lib/device/program/shell2";
import { DAEMON_ECHO_REPLIER } from "../lib/device/program/echo-replier";
import { DEVICE_PROGRAM_CLEAR, DEVICE_PROGRAM_ECHO, DEVICE_PROGRAM_HELP } from "../lib/device/program/program2";
import { DEVICE_PROGRAM_PING } from "../lib/device/program/ping2";
import { DEVICE_PROGRAM_IFINFO } from "../lib/device/program/ifinfo2";

class NetworkMapInterface {
    iface: EthernetInterface;
    nmDevice: NetworkMapDevice;

    i: number;

    x: number;
    y: number;

    connectorStroke = "#33e42d"
    connectorStrokeHighlight = "#cc2e12"


    constructor(nmDevice: NetworkMapDevice, iface: EthernetInterface, i: number) {
        this.nmDevice = nmDevice;
        this.iface = iface;
        this.i = i;

        this.x = this.nmDevice.x + (this.i * 14);
        this.y = this.nmDevice.y + this.nmDevice.height;


        iface.onRecv = this.onRecv.bind(this)
        iface.onSend = this.onSend.bind(this)
        iface.receive_delay = INTERFACE_ANIM_DELAY;
    }

    onSend() {
        this.element.setAttribute("fill", "orange");
        setTimeout(() => {
            this.element.setAttribute("fill", this.iface.up ? "green" : "red")
        }, INTERFACE_ANIM_DELAY)
    }
    onRecv() {
        this.element.setAttribute("fill", "purple");
        setTimeout(() => {
            this.element.setAttribute("fill", this.iface.up ? "green" : "red")
        }, INTERFACE_ANIM_DELAY)
    }

    element: SVGRectElement = <rect x={0} y={0} width={0} height={0} /> as SVGRectElement

    update() {
        this.x = this.nmDevice.x + (this.i * 15);
        this.y = this.nmDevice.y + this.nmDevice.height;

        let width = 10, height = width;

        this.element.setAttribute("x", this.x + "")
        this.element.setAttribute("y", this.y + "")
        this.element.setAttribute("width", width + "")
        this.element.setAttribute("height", height + "")
        this.element.setAttribute("fill", this.iface.up ? "green" : "red")
    }

    render() {
        this.update()
        return this.element;
    }
}
class NetworkMapDevice {
    x: number;
    y: number;
    width: number;
    height: number;
    device: Device2;
    nmInterfaces: Array<NetworkMapInterface>
    constructor(x: number, y: number, device: Device2) {
        this.x = x;
        this.y = y;
        this.width = 50;
        this.height = this.width;
        this.device = device;

        this.nmInterfaces = this.device.interfaces.filter(iface => iface instanceof EthernetInterface).map((iface, i) => (new NetworkMapInterface(this, iface as EthernetInterface, i)));
    }

    mouseIsDown = false;
    mouseDownPos?: { x: number; y: number }

    map?: NetworkMap;
    update() {
        if (this.device instanceof NetworkSwitch2) {
            this.width = 75;
            this.height = 25
        }

        this.rect.setAttribute("x", this.x + "")
        this.rect.setAttribute("y", this.y + "")
        this.rect.setAttribute("width", this.width + "")
        this.rect.setAttribute("height", this.height + "")
        this.rect.setAttribute("fill", "#4f3f3f")
        this.text.setAttribute("x", this.x + 10 + "")
        this.text.setAttribute("y", this.y + 20 + "")
        this.text.textContent = this.device.name;

        this.nmInterfaces.forEach((iface) => iface.update())

        if (!this.map) return;

        this.map.updateConnections()
        // this.map.update()
    }

    rect: SVGRectElement = <rect /> as SVGRectElement;
    text: SVGTextElement = <text /> as SVGTextElement;

    render() {

        this.update()
        return <g onMouseDown={(ev) => {
            this.mouseIsDown = true;
            this.mouseDownPos = { x: ev.clientX, y: ev.clientY }
        }}
            onMouseMove={(ev) => {
                if (!this.mouseIsDown || !this.mouseDownPos) return;

                let diffX = ev.clientX - this.mouseDownPos.x, diffY = ev.clientY - this.mouseDownPos.y;

                this.x += diffX;
                this.y += diffY;

                this.mouseDownPos.x = ev.clientX;
                this.mouseDownPos.y = ev.clientY;

                this.update()
            }}
            onMouseUp={() => this.mouseIsDown = false}
            onMouseLeave={() => this.mouseIsDown = false}

            onClick={() => {
                terminalOwner.terminal_detach()
                terminalOwner = this.device;
                terminalOwner.terminal_attach(terminal);
                let proc = terminalOwner.processes.find(p => p && p.id.includes(DAEMON_SHELL.name))
                if (!proc) {
                    terminalOwner.process_start(DAEMON_SHELL);
                } else {
                    proc.device.process_termwriteto(proc, new Uint8Array([10])); // press enter
                }
            }}
        >
            {this.rect}
            {this.text}
            {this.nmInterfaces.map(iface => iface.render() as any)}
        </g>
    }

}
interface NetworkMapConnection {
    master: NetworkMapInterface;
    slave: NetworkMapInterface;
    path: JSX.Element;
}
class NetworkMap {
    devices: Array<NetworkMapDevice> = [];
    connections: Array<NetworkMapConnection> = [];

    map: JSX.Element;

    container?: Element;

    constructor() {
        this.update()
    }

    updateConnections() {
        // let prevConnections = this.connections.slice();
        // this.calculateConnections();
        // if (prevConnections.length != this.connections.length) {
        //     return this.update()
        // }
        for (let connection of this.connections) {
            (connection.path as SVGPathElement).setAttribute("d", this.calculateConnectionPath(connection.master, connection.slave));
        }
    }

    private findTarget(iface: NetworkMapInterface): NetworkMapInterface | null {
        if (!iface.iface.up) return null;

        for (let nmd of this.devices) {
            if (nmd == iface.nmDevice) continue;
            let nmi = nmd.nmInterfaces.find((nmi) => nmi.iface == (iface.iface as any).target)

            if (nmi) return nmi;
        }
        return null;
    }

    calculateConnectionPath(master: NetworkMapInterface, slave: NetworkMapInterface): string {
        let width = 10, height = width;

        let xStartOffset = width / 2;
        let yPad = 15 * (master.i + 1);

        let tx = slave.x, ty = slave.y;

        let d = `M${master.x + xStartOffset} ${master.y + height}`;

        if (master.y >= ty) {
            d += `v${yPad}`
        } else {
            d += `v${yPad + (ty - master.y)}`
        }

        if (master.x == tx) {

        } else {
            d += `h${tx - master.x}`
        }

        if (master.y < ty) {
            d += `v${-yPad}`
        } else {
            d += `v${ty - master.y - yPad}`
        }

        return d;
    }

    private calculateConnections() {
        this.connections = [];

        let touched: Array<NetworkMapInterface> = [];

        for (let device of this.devices) {
            for (let iface of device.nmInterfaces) {
                if (!iface.iface.up) continue;
                let target = this.findTarget(iface);

                if (!target) continue;
                if (touched.indexOf(target) >= 0) continue;
                let connectionMaster = (() => {
                    if (device.nmInterfaces.length != target.nmDevice.nmInterfaces.length) return device.nmInterfaces.length > target.nmDevice.nmInterfaces.length;
                    else return this.devices.indexOf(device) < this.devices.indexOf(target.nmDevice)
                })()

                if (!connectionMaster) continue;

                let path = <path d={this.calculateConnectionPath(iface, target)} stroke={iface.connectorStroke} stroke-width={5} fill="none"
                    stroke-linejoin="round"
                    onMouseEnter={(e) => e.currentTarget.style.stroke = iface.connectorStrokeHighlight}
                    onMouseLeave={(e) => e.currentTarget.style.stroke = iface.connectorStroke}
                />

                this.connections.push({
                    master: iface,
                    slave: target,
                    path: path
                })

                touched.push(iface);
            }
        }


    }

    addDevice(device: NetworkMapDevice) {
        device.map = this
        this.devices.push(device);
        this.update()
    }

    removeDevice(device: NetworkMapDevice) {
        this.devices = this.devices.filter((d) => d != device);
        this.update()
    }

    update() {
        this.calculateConnections();

        if (this.container) {
            this.container.innerHTML = ""
            this.container.appendChild(this.render() as any)
        }

    }

    render(): JSX.Element {
        return <g>
            <g>
                {this.devices.map(d => d.render())}
            </g>
            <g>
                {this.connections.map(c => c.path)}
            </g>
        </g>
    }
}

const INTERFACE_ANIM_DELAY = 900;

function init_programs(device: Device2) {
    device.process_start(DAEMON_ECHO_REPLIER);
    device.programs = [
        DEVICE_PROGRAM_ECHO,
        DEVICE_PROGRAM_IFINFO,
        DEVICE_PROGRAM_HELP,
        DEVICE_PROGRAM_CLEAR,
        DEVICE_PROGRAM_PING,
    ]
}

let networkSwitch = new NetworkSwitch2();
let networkSwitch2 = new NetworkSwitch2();
networkSwitch.name = "SW1"
networkSwitch2.name = "SW2"

let swIface_trunk = networkSwitch.interface_add(new EthernetInterface(networkSwitch));
let swIface2_trunk = networkSwitch2.interface_add(new EthernetInterface(networkSwitch2));
swIface_trunk.connect(swIface2_trunk);

let swIface_pc1 = networkSwitch.interface_add(new EthernetInterface(networkSwitch));
let swIface_pc2 = networkSwitch.interface_add(new EthernetInterface(networkSwitch));
let swIface_pc3 = networkSwitch.interface_add(new EthernetInterface(networkSwitch));
let swIface_pc4 = networkSwitch.interface_add(new EthernetInterface(networkSwitch));

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
swIface_pc4.vlan = vlan20;
swIface2_pc5.vlan = vlan20;

swIface_trunk.vlan = vlanTrunk;
swIface2_trunk.vlan = vlanTrunk;

let pc1 = new Device2(); pc1.name = "PC1";
let pc2 = new Device2(); pc2.name = "PC2";
let pc3 = new Device2(); pc3.name = "PC3";

// vlan test
let pc4 = new Device2(); pc4.name = "PC4";
let pc5 = new Device2(); pc5.name = "PC5";

let iface_pc1 = pc1.interface_add(new EthernetInterface(pc1));
let iface_pc2 = pc2.interface_add(new EthernetInterface(pc2));
let iface_pc3 = pc3.interface_add(new EthernetInterface(pc3));

// vlan test
let iface_pc4 = pc4.interface_add(new EthernetInterface(pc4));
let iface_pc5 = pc5.interface_add(new EthernetInterface(pc5));

pc1.interface_set_address(iface_pc1, new IPV4Address("192.168.1.10"), createMask(IPV4Address, 24))
pc2.interface_set_address(iface_pc2, new IPV4Address("192.168.1.20"), createMask(IPV4Address, 24))

pc4.interface_set_address(iface_pc4, new IPV4Address("172.16.0.40"), createMask(IPV4Address, 24))
pc5.interface_set_address(iface_pc5, new IPV4Address("172.16.0.50"), createMask(IPV4Address, 24))

swIface_pc1.connect(iface_pc1);
swIface_pc2.connect(iface_pc2);
swIface_pc3.connect(iface_pc3);
swIface_pc4.connect(iface_pc4);

swIface2_pc5.connect(iface_pc5)

init_programs(networkSwitch)
init_programs(networkSwitch2)
init_programs(pc1)
init_programs(pc2)
init_programs(pc3)
init_programs(pc4)
init_programs(pc5)

let nmDevice_sw = new NetworkMapDevice(50, 50, networkSwitch);
let nmDevice_pc1 = new NetworkMapDevice(150, 50, pc1);
let nmDevice_pc2 = new NetworkMapDevice(220, 50, pc2);
let nmDevice_pc3 = new NetworkMapDevice(290, 50, pc3);

let nmDevice_pc4 = new NetworkMapDevice(400, 50, pc4);
let nmDevice_pc5 = new NetworkMapDevice(400, 350, pc5);
let nmDevice_sw2 = new NetworkMapDevice(100, 350, networkSwitch2);

let terminalOwner = pc1;
let terminal: Terminal;

export default function NetworkMapViewer(): JSX.Element {
    let nmap = new NetworkMap();
    nmap.addDevice(nmDevice_pc1)
    nmap.addDevice(nmDevice_pc2)
    nmap.addDevice(nmDevice_pc3)
    nmap.addDevice(nmDevice_sw)

    // vlan test
    nmap.addDevice(nmDevice_pc4)
    nmap.addDevice(nmDevice_pc5)
    nmap.addDevice(nmDevice_sw2)

    return <div style={{ width: "100%" }} >

        <svg width={"100%"} height={500} >
            <g ref={(el => { nmap.container = el; nmap.update() })}></g>
        </svg>

        <div ref={(el) => {
            terminal = new Terminal(el);
            terminalOwner.terminal_attach(terminal);
            terminalOwner.process_start(DAEMON_SHELL);
        }}></div>
    </div>
};

