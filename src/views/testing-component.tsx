import { Component, JSX } from "solid-js";
import { Device } from "../lib/device/device";
import { Host } from "../lib/device/host";
import { NetworkSwitch } from "../lib/device/network-switch";
import { pingVersion4, pingVersion6 } from "../lib/device/applications/ping";
import { createMask } from "../lib/address/mask";
import { IPV4Address } from "../lib/address/ipv4";
import { IPV6Address } from "../lib/address/ipv6";
import DeviceServiceDHCPServer from "../lib/device/service/dhcp-server";
import { resolveDHCPv4 } from "../lib/device/applications/resolve-dhcp/resolve-dhcp-v4";
import { NetworkRouter } from "../lib/device/network-router";
const selectContents = (ev: MouseEvent) => {
    if (!(ev.currentTarget instanceof HTMLElement)) return;
    let range = document.createRange();
    range.selectNode(ev.currentTarget);
    window.getSelection()?.addRange(range);
}

const DeviceComponent: Component<{ device: Device }> = ({ device }) => {

    return <div>
        <div style={{ display: "flex", "justify-content": "space-between" }}>
            <h1>{device.name}</h1>
            <a href="" onClick={ev => {
                let f = device.createCaptureFile();
                if (!f) return alert("No content to dowload"), ev.preventDefault()
                ev.currentTarget.download = f.name;
                ev.currentTarget.href = URL.createObjectURL(f);
            }}>Download</a>
        </div>
        <div>
            {device.interfaces.map((iface) => (
                <div>
                    <h5>{iface.ifID}</h5>
                    <p>MAC address: <span onClick={selectContents}>{iface.macAddress.toString()}</span></p>
                    {iface.ipv4Address && iface.ipv4SubnetMask && (
                        <p>IPv4 address: <span onClick={selectContents}>{iface.ipv4Address.toString()}</span>/<span>{iface.ipv4SubnetMask.length}</span></p>
                    )}
                    {iface.ipv6Address && iface.prefixLength && (
                        <p>IPv6 address: <span onClick={selectContents}>{iface.ipv6Address.toString(4)}</span>/<span>{iface.prefixLength}</span></p>
                    )}
                    <p>is connected: {iface.isConnected + ""}</p>
                </div>
            ))}
        </div>
    </div>
}

let networkSwitch = new NetworkSwitch();
networkSwitch.name = "SW1"

let swIface_pc1 = networkSwitch.createInterface();
let swIface_pc2 = networkSwitch.createInterface();

let pc1 = new Host();
let pc2 = new Host();
pc1.name = "PC1"
pc2.name = "PC2"

let iface_pc1 = pc1.createInterface();
let iface_pc2 = pc2.createInterface();

iface_pc1.ipv4Address = new IPV4Address("192.168.1.10")
iface_pc1.ipv4SubnetMask = createMask(IPV4Address, 24);
iface_pc1.ipv6Address = new IPV6Address("fe80::c438:600:a1ac:ba00")//createLinkLocalAddressV6();
iface_pc1.prefixLength = 64;

// iface_pc2.ipv4Address = new IPV4Address("192.168.1.20")
// iface_pc2.ipv4SubnetMask = createMask(IPV4Address, 24);
iface_pc2.ipv6Address = new IPV6Address("fe80::c438:600:a1ac:b778")//createLinkLocalAddressV6();
iface_pc2.prefixLength = 64;

iface_pc2.dhcp = [4]

swIface_pc1.connect(iface_pc1);
swIface_pc2.connect(iface_pc2);

let dhcpServer = new DeviceServiceDHCPServer(pc1)

dhcpServer.configure({
    ipv4AddressRange: [new IPV4Address("192.168.1.100"), new IPV4Address("192.168.1.200")],
    ipv4SubnetMask: iface_pc1.ipv4SubnetMask,
    iface: iface_pc1
})

pc1.addService(dhcpServer);

// TESTING STARTING
let networkRouter = new NetworkRouter();
networkRouter.name = "R1";

let rIface_sw = networkRouter.createInterface();
rIface_sw.ipv4Address = new IPV4Address("192.168.1.1");
rIface_sw.ipv4SubnetMask = createMask(IPV4Address, 24);

let rIface_pc3 = networkRouter.createInterface();
rIface_pc3.ipv4Address = new IPV4Address("192.168.3.1");
rIface_pc3.ipv4SubnetMask = createMask(IPV4Address, 24);


let swIface_router = networkSwitch.createInterface();
swIface_router.connect(rIface_sw)




let pc3 = new Host();
pc3.name = "PC3"

let iface_pc3 = pc3.createInterface();
iface_pc3.ipv4Address = new IPV4Address("192.168.3.30")
iface_pc3.ipv4SubnetMask = createMask(IPV4Address, 24);

iface_pc3.connect(rIface_pc3);


iface_pc1.ipv4GW = rIface_sw.ipv4Address;
iface_pc3.ipv4GW = rIface_pc3.ipv4Address;

dhcpServer.configure({
    ipv4GWAddress: [rIface_sw.ipv4Address]
})

// TESTING END

export const TestingComponent: Component = () => {

    return (
        <div>
            <header>
                <h2>This is a component where trying things are acceptable.</h2>
            </header>
            <button onClick={() => {
                resolveDHCPv4(pc2, iface_pc2);
            }}>Press me</button>
            <div>
                <DeviceComponent device={pc1} />
                <DeviceComponent device={networkSwitch} />
                <DeviceComponent device={pc2} />
                <DeviceComponent device={networkRouter} />
                <DeviceComponent device={pc3} />
            </div>

            {[pc1, pc2].map((device) => (
                <button onClick={async () => {
                    let ip = prompt("Please enter a destination ip, from: " + device.name)

                    if (!ip) return;

                    if (IPV4Address.validate(ip)) {
                        await pingVersion4(device, new IPV4Address(ip))
                    } else if (/* IPV6Address.validate(ip) */ true) {
                        await pingVersion6(device, new IPV6Address(ip))
                    }

                    console.log("%c ECHO Reply recieved: " + device.name, ['background: green', 'color: white', 'display: block', 'text-align: center', 'font-size: 24px'].join(';'))

                }}>Ping from: {device.name}</button>
            ))}
        </div>
    )
}