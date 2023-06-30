import { Component, JSX } from "solid-js";
import { Device } from "../lib/device/device";
import { Host } from "../lib/device/host";
import { NetworkSwitch } from "../lib/device/network-switch";
import { pingVersion4, pingVersion6 } from "../lib/device/applications/ping";
import { createMask } from "../lib/address/mask";
import { IPV4Address } from "../lib/address/ipv4";
import { IPV6Address } from "../lib/address/ipv6";

const selectContents = (ev: MouseEvent) => {
    if (!(ev.currentTarget instanceof HTMLElement)) return;
    let range = document.createRange();
    range.selectNode(ev.currentTarget);
    window.getSelection()?.addRange(range);
}

const DeviceComponent: Component<{ device: Device }> = ({ device }) => {

    return <div>
        <div style={{display: "flex", "justify-content": "space-between"}}>
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

export const TestingComponent: Component = () => {
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

    iface_pc2.ipv4Address = new IPV4Address("192.168.1.20")
    iface_pc2.ipv4SubnetMask = createMask(IPV4Address, 24);
    iface_pc2.ipv6Address = new IPV6Address("fe80::c438:600:a1ac:b778")//createLinkLocalAddressV6();
    iface_pc2.prefixLength = 64;

    swIface_pc1.connect(iface_pc1);
    swIface_pc2.connect(iface_pc2);

    return (
        <div>
            <header>
                <h2>This is a component where trying things are acceptable.</h2>
            </header>

            <div>
                <DeviceComponent device={pc1} />
                <DeviceComponent device={networkSwitch} />
                <DeviceComponent device={pc2} />
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