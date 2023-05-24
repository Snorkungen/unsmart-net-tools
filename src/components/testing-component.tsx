import { Component, JSX } from "solid-js";
import { EthernetFrame } from "../lib/ethernet";
import { IPPacketV4 } from "../lib/ip/packet/v4";
import { AddressV4, SubnetMaskV4, validateDotNotated } from "../lib/ip/v4";
import { ICMPPacketV4, ICMP_TYPES, createROHEcho } from "../lib/ip/v4/icmp";
import { Device } from "../lib/device/device";
import { ETHER_TYPES } from "../lib/ethernet/types";
import { PROTOCOLS } from "../lib/ip/packet/protocols";
import { Host, resolveSendingInformation } from "../lib/device/host";
import { NetworkSwitch } from "../lib/device/network-switch";
import { AddressV6, matchAddressTypeV6 } from "../lib/ip/v6/address";
import { ALL_NODES_ADDRESSV6 } from "../lib/ip/v6";
import { createLinkLocalAddressV6 } from "../lib/ip/v6/link-local";

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
                    <p>is connected: {iface.isConnected + ""}</p>
                </div>
            ))}
        </div>
    </div>
}

async function ping(device: Host, destination: AddressV4) {
    try {

        let n = Math.floor(Math.random() * 1_000)
        let icmpPacket = new ICMPPacketV4(ICMP_TYPES.ECHO_REQUEST, 0, createROHEcho(n, 0))

        let entry = await resolveSendingInformation(device, destination);
        if (!entry.iface.isConnected || !entry.iface.ipAddressV4 || !entry.iface.subnetMaskV4) {
            // failed because interface does not have ipv4 configured
            // return;
            // Do nothing because i haven't decided if the device should have an async send function. So thats why this allows me to have an device ping it self
        }

        let ipv4Packet = new IPPacketV4(entry.iface.ipAddressV4!, destination, PROTOCOLS.ICMP, icmpPacket.bits);
        let frame = new EthernetFrame(entry.macAddress, entry.iface.macAddress, ETHER_TYPES.IPv4, ipv4Packet.bits)

        device.statefulSend(frame, () => {
            console.log("%c ECHO Reply recieved: " + device.name, ['background: green', 'color: white', 'display: block', 'text-align: center', 'font-size: 24px'].join(';'))
        })
    } catch (error) {
        console.error(error)
    }
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

    iface_pc2.ipAddressV4 = new AddressV4("192.168.1.20")
    iface_pc2.subnetMaskV4 = new SubnetMaskV4(24);

    swIface_pc1.connect(iface_pc1);
    swIface_pc2.connect(iface_pc2);

    let ipv6Address = new AddressV6("::");
    console.log(ipv6Address.toString(4),matchAddressTypeV6("UNSPECIFIED", ipv6Address))
    ipv6Address = new AddressV6(ALL_NODES_ADDRESSV6)
    console.log(ipv6Address.toString(4),ipv6Address.isMulticast)
    
    let linkLocalAddress = createLinkLocalAddressV6();
    console.log(linkLocalAddress.toString(4),linkLocalAddress.isLinkLocal)


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
                <button onClick={() => {
                    let ip = prompt("Please enter a destination ip, from: " + device.name)

                    if (ip && validateDotNotated(ip)) {
                        ping(device, new AddressV4(ip))
                    }
                }}>Ping from: {device.name}</button>
            ))}
        </div>
    )
}