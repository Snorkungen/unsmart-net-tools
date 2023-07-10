import { Accessor, Component, For, createSignal } from "solid-js";
import { JSX } from "solid-js/jsx-runtime";
import { IPV4Address } from "../lib/address/ipv4";
import { createMask } from "../lib/address/mask";
import { Host } from "../lib/device/host";
import { Device } from "../lib/device/device";
import { NetworkSwitch } from "../lib/device/network-switch";
import { Interface } from "../lib/device/interface";
import ping from "../lib/device/applications/ping";
import { TTY } from "../components/tty";

class NetworkMapInterface {
    iface: Interface;
    nmDevice: NetworkMapDevice;

    i: number;

    x: number;
    y: number;

    connectorStroke = "#33e42d"
    connectorStrokeHighlight = "#cc2e12"


    constructor(nmDevice: NetworkMapDevice, iface: Interface, i: number) {
        this.nmDevice = nmDevice;
        this.iface = iface;
        this.i = i;

        this.x = this.nmDevice.x + (this.i * 14);
        this.y = this.nmDevice.y + this.nmDevice.height;


        iface.onRecv = this.onRecv.bind(this)
        iface.onSend = this.onSend.bind(this)
        iface.recvWait = INTERFACE_ANIM_DELAY;
    }

    onSend() {
        this.element.setAttribute("fill", "orange");
        setTimeout(() => {
            this.element.setAttribute("fill", this.iface.isConnected ? "green" : "red")
        }, INTERFACE_ANIM_DELAY)
    }
    onRecv() {
        this.element.setAttribute("fill", "purple");
        setTimeout(() => {
            this.element.setAttribute("fill", this.iface.isConnected ? "green" : "red")
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
        this.element.setAttribute("fill", this.iface.isConnected ? "green" : "red")
    }

    render() {
        this.update()
        return this.element;
    }
}
class NetworkMapDevice {
    x: number;
    y: number;
    width:number;
    height:number;
    device: Device;
    nmInterfaces: Array<NetworkMapInterface>
    constructor(x: number, y: number, device: Device) {
        this.x = x;
        this.y = y;
        this.width = 50;
        this.height = this.width;
        this.device = device;

        this.nmInterfaces = this.device.interfaces.map((iface, i) => new NetworkMapInterface(this, iface, i));
    }

    mouseIsDown = false;
    mouseDownPos?: { x: number; y: number }

    map?: NetworkMap;
    update() {
        if (this.device instanceof NetworkSwitch) {
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
        if (!iface.iface.isConnected) return null;

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
                if (!iface.iface.isConnected) continue;
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

let networkSwitch = new NetworkSwitch();
let networkSwitch2 = new NetworkSwitch();
networkSwitch.name = "SW1"
networkSwitch2.name = "SW2"

let swIface_trunk = networkSwitch.createInterface();
let swIface2_trunk = networkSwitch2.createInterface();
swIface_trunk.connect(swIface2_trunk);

let swIface_pc1 = networkSwitch.createInterface();
let swIface_pc2 = networkSwitch.createInterface();
let swIface_pc3 = networkSwitch.createInterface();
let swIface_pc4 = networkSwitch.createInterface();


let swIface2_pc5 = networkSwitch2.createInterface();


let vlan10: Interface["vlan"] = {
    type: "access",
    vids: [10]
}, vlan20: Interface["vlan"] = {
    type: "access",
    vids: [20]
}, vlanTrunk: Interface["vlan"] = {
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

const createHost = (name: string) => {
    let host = new Host();
    host.name = name;
    host.neighborTable.timeout = host.neighborTable.timeout * INTERFACE_ANIM_DELAY;
    return host;
}

let pc1 = createHost("PC1")
let pc2 = createHost("PC2")
let pc3 = createHost("PC3")

// vlan test
let pc4 = createHost("PC4")
let pc5 = createHost("PC5")

let iface_pc1 = pc1.createInterface();
let iface_pc2 = pc2.createInterface();
let iface_pc3 = pc3.createInterface();

// vlan test
let iface_pc4 = pc4.createInterface();
let iface_pc5 = pc5.createInterface();

iface_pc1.ipv4Address = new IPV4Address("192.168.1.10")
iface_pc1.ipv4SubnetMask = createMask(IPV4Address, 24);
iface_pc2.ipv4Address = new IPV4Address("192.168.1.20")
iface_pc2.ipv4SubnetMask = createMask(IPV4Address, 24);


iface_pc4.ipv4Address = new IPV4Address("172.16.0.40")
iface_pc4.ipv4SubnetMask = createMask(IPV4Address, 24);
iface_pc5.ipv4Address = new IPV4Address("172.16.0.50")
iface_pc5.ipv4SubnetMask = createMask(IPV4Address, 24);

swIface_pc1.connect(iface_pc1);
swIface_pc2.connect(iface_pc2);
swIface_pc3.connect(iface_pc3);
swIface_pc4.connect(iface_pc4);

swIface2_pc5.connect(iface_pc5)

let nmDevice_sw = new NetworkMapDevice(50, 50, networkSwitch);
let nmDevice_pc1 = new NetworkMapDevice(150, 50, pc1);
let nmDevice_pc2 = new NetworkMapDevice(220, 50, pc2);
let nmDevice_pc3 = new NetworkMapDevice(290, 50, pc3);

let nmDevice_pc4 = new NetworkMapDevice(400, 50, pc4);
let nmDevice_pc5 = new NetworkMapDevice(400, 350, pc5);
let nmDevice_sw2 = new NetworkMapDevice(100, 350, networkSwitch2);


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
        <button
            onClick={() => {
                ping(pc2, iface_pc1.ipv4Address!).then(() => {
                    console.log("%c ECHO Reply recieved: " + pc2.name, ['background: green', 'color: white', 'display: block', 'text-align: center', 'font-size: 24px'].join(';'))
                })
            }}
        >Ping IPV4 pc2 =&gt pc1</button>
        <button
            onClick={() => {
                ping(pc4, iface_pc5.ipv4Address!).then(() => {
                    console.log("%c ECHO Reply recieved: " + pc5.name, ['background: green', 'color: white', 'display: block', 'text-align: center', 'font-size: 24px'].join(';'))
                })
            }}
        >Ping IPV4 pc4 =&gt pc5</button>

        <TTY device={pc1} />
    </div>
};

