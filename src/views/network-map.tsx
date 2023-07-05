import { Component, For } from "solid-js";
import { JSX } from "solid-js/jsx-runtime";
import { IPV4Address } from "../lib/address/ipv4";
import { createMask } from "../lib/address/mask";
import { Host } from "../lib/device/host";
import { Device } from "../lib/device/device";
import { NetworkSwitch } from "../lib/device/network-switch";
import { Interface } from "../lib/device/interface";

let networkSwitch = new NetworkSwitch();
networkSwitch.name = "SW1"

let swIface_pc1 = networkSwitch.createInterface();
let swIface_pc2 = networkSwitch.createInterface();
let swIface_pc3 = networkSwitch.createInterface();

let pc1 = new Host();
let pc2 = new Host();
let pc3 = new Host();
pc1.name = "PC1"
pc2.name = "PC2"
pc3.name = "PC3"

let iface_pc1 = pc1.createInterface();
let iface_pc2 = pc2.createInterface();
let iface_pc3 = pc3.createInterface();


iface_pc1.ipv4Address = new IPV4Address("192.168.1.10")
iface_pc1.ipv4SubnetMask = createMask(IPV4Address, 24);

swIface_pc1.connect(iface_pc1);
swIface_pc2.connect(iface_pc2);
swIface_pc3.connect(iface_pc3);

export default function NetworkMap(): JSX.Element {
    let nmDevice_sw = new NetworkMapDevice(120, 200, networkSwitch);
    let nmDevice_pc1 = new NetworkMapDevice(100, 100, pc1);
    let nmDevice_pc2 = new NetworkMapDevice(200, 200, pc2);
    let nmDevice_pc3 = new NetworkMapDevice(300, 200, pc3);


    return <div style={{ width: "100%" }}>

        <svg width={"100%"} height={500} >
            {nmDevice_pc1.render()}
            {nmDevice_pc2.render()}
            {nmDevice_pc3.render()}
            {nmDevice_sw.render()}
        </svg>

    </div>
};

let devices: NetworkMapDevice[] = [];

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
        this.y = this.nmDevice.y + 50;
    }

    private findTarget(): NetworkMapInterface | null {
        if (!this.iface.isConnected) return null;

        for (let nmd of devices) {
            if (nmd == this.nmDevice) continue;
            let nmi = nmd.nmInterfaces.find((nmi) => nmi.iface == (this.iface as any).target)

            if (nmi) return nmi;
        }
        return null;
    }

    render() {
        this.x = this.nmDevice.x + (this.i * 14);
        this.y = this.nmDevice.y + 50;

        let path: any = null;
        let target = this.findTarget()

        let width = 10, height = width;

        pathsetter: if (target) {
            let connectionMaster = (() => {
                if (this.nmDevice.nmInterfaces.length != target.nmDevice.nmInterfaces.length) return this.nmDevice.nmInterfaces.length > target.nmDevice.nmInterfaces.length;
                else return devices.indexOf(this.nmDevice) < devices.indexOf(target.nmDevice)
            })()
            if (!connectionMaster) break pathsetter;

            let xStartOffset = width / 2;
            let yPad = 15 * (this.i + 1);

            let tx = target.x, ty = target.y;

            let d = `M${this.x + xStartOffset} ${this.y + height}`;

            if (this.y >= ty) {
                d += `v${yPad}`
            } else {
                d += `v${yPad + (ty - this.y)}`
            }

            if (this.x == tx) {

            } else {
                d += `h${tx - this.x}`
            }

            if (this.y < ty) {
                d += `v${-yPad}`
            } else {
                d += `v${ty - this.y - yPad}`
            }

            path = <path d={d} stroke={this.connectorStroke} stroke-width={width / 2} fill="none"
                stroke-linejoin="round"
                onMouseEnter={(e) => e.currentTarget.style.stroke = this.connectorStrokeHighlight}
                onMouseLeave={(e) => e.currentTarget.style.stroke = this.connectorStroke}
            />
        }

        return <g>
            <rect x={this.x} y={this.y} width={width} height={height} fill={this.iface.isConnected ? "green" : "red"} />
            {path}
        </g>
    }
}
class NetworkMapDevice {
    x: number;
    y: number;
    device: Device;
    nmInterfaces: Array<NetworkMapInterface>
    constructor(x: number, y: number, device: Device) {
        this.x = x;
        this.y = y;
        this.device = device;

        this.nmInterfaces = this.device.interfaces.map((iface, i) => new NetworkMapInterface(this, iface, i));

        devices.push(this)
    }


    render() {
        return <g>
            <rect onDragStart={() => {
                console.log("hdjkf")
            }} x={this.x} y={this.y} width={50} height={50} fill="#4f3f3f" />
            <text x={this.x + 10} y={this.y + 20}>{this.device.name}</text>
            {this.nmInterfaces.map(iface => iface.render())}
        </g>
    }
}