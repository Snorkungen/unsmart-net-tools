import { Component, JSX } from "solid-js";
import { AddressV4, SubnetMaskV4, validateDotNotated } from "../lib/ip/v4";
import { Device } from "../lib/device/device";
import { Host } from "../lib/device/host";
import { NetworkSwitch } from "../lib/device/network-switch";
import { AddressV6 } from "../lib/ip/v6";
import { pingVersion4, pingVersion6 } from "../lib/device/applications/ping";

const selectContents = (ev: MouseEvent) => {
    if (!(ev.currentTarget instanceof HTMLElement)) return;
    let range = document.createRange();
    range.selectNode(ev.currentTarget);
    window.getSelection()?.addRange(range);
}

const DeviceComponent: Component<{ device: Device }> = ({ device }) => {

    return <div>
        <div>
            <h1>{device.name}</h1>
        </div>
        <div>
            {device.interfaces.map((iface) => (
                <div>
                    <h5>{iface.ifID}</h5>
                    <p>MAC address: <span onClick={selectContents}>{iface.macAddress.toString()}</span></p>
                    {iface.ipAddressV4 && iface.subnetMaskV4 && (
                        <p>IPv4 address: <span onClick={selectContents}>{iface.ipAddressV4.toString()}</span>/<span>{iface.subnetMaskV4.length}</span></p>
                    )}
                    {iface.ipAddressV6 && iface.prefixLength && (
                        <p>IPv6 address: <span onClick={selectContents}>{iface.ipAddressV6.toString(4)}</span>/<span>{iface.prefixLength}</span></p>
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

    iface_pc1.ipAddressV4 = new AddressV4("192.168.1.10")
    iface_pc1.subnetMaskV4 = new SubnetMaskV4(24);
    iface_pc1.ipAddressV6 = new AddressV6("fe80::c438:600:a1ac:ba00")//createLinkLocalAddressV6();
    iface_pc1.prefixLength = 64;

    iface_pc2.ipAddressV4 = new AddressV4("192.168.1.20")
    iface_pc2.subnetMaskV4 = new SubnetMaskV4(24);
    iface_pc2.ipAddressV6 = new AddressV6("fe80::c438:600:a1ac:b778")//createLinkLocalAddressV6();
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

                    if (validateDotNotated(ip)) {
                        await pingVersion4(device, new AddressV4(ip))
                    } else if (new AddressV6(ip).bits.toNumber() != 0) {
                        await pingVersion6(device, new AddressV6(ip))
                    }

                    console.log("%c ECHO Reply recieved: " + device.name, ['background: green', 'color: white', 'display: block', 'text-align: center', 'font-size: 24px'].join(';'))

                }}>Ping from: {device.name}</button>
            ))}
        </div>
    )
}