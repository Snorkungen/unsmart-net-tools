import { Component } from "solid-js";
import { EthernetFrame, MACAddress } from "../lib/ethernet";
import { IPPacketV4 } from "../lib/ip/packet/v4";
import { AddressV4, SubnetMaskV4, validateDotNotated } from "../lib/ip/v4";
import { ICMPPacketV4 } from "../lib/ip/v4/icmp";
import { Device, resolveSendingInformation } from "../lib/device/device";
import { ETHER_TYPES } from "../lib/ethernet/types";
import { PROTOCOLS } from "../lib/ip/packet/protocols";

const DeviceComponent: Component<{ device: Device }> = ({ device }) => {

    return <div>
        <div>
            <h1>{device.name}</h1>
        </div>
        <div>
            {device.interfaces.map((iface) => (
                <div>
                    <h5>{iface.ifID}</h5>
                    <p>MAC address: <span>{iface.macAddress.toString()}</span></p>
                    {iface.ipAddressV4 && iface.subnetMaskV4 && (
                        <p>IPv4 address: <span>{iface.ipAddressV4.toString()}</span>/<span>{iface.subnetMaskV4.length}</span></p>
                    )}
                    <p>is connected: {iface.isConnected + ""}</p>
                </div>
            ))}
        </div>
    </div>
}

async function ping(device: Device, destination: AddressV4) {
    try {
        let icmpPacket = new ICMPPacketV4(8, 0,)

        // before sending i should create some type of device level hook that would respond to this packet

        device.send(destination, PROTOCOLS.ICMP, icmpPacket)
    } catch (error) {
        console.error(error)
    }
}

export const TestingComponent: Component = () => {

    let pc1 = new Device();
    let pc2 = new Device();
    pc1.name = "PC1"
    pc2.name = "PC2"

    let iface_pc1 = pc1.createInterface();
    let iface_pc2 = pc2.createInterface();

    iface_pc1.ipAddressV4 = new AddressV4("192.168.1.10")
    iface_pc1.subnetMaskV4 = new SubnetMaskV4(24);

    iface_pc2.ipAddressV4 = new AddressV4("192.168.1.20")
    iface_pc2.subnetMaskV4 = new SubnetMaskV4(24);

    iface_pc2.connect(iface_pc1)

    return (
        <div>
            <header>
                <h2>This is a component where trying things are acceptable.</h2>
            </header>

            <div>
                <DeviceComponent device={pc1} />
                <DeviceComponent device={pc2} />
            </div>

            {[pc1, pc2].map((device) => (
                <button onClick={() => {
                    let ip = prompt("Please enter a destination ip, from: " + device.name)

                    if (ip && validateDotNotated(ip)) {
                        ping (device, new AddressV4(ip))
                    }


                }}>Ping from: {device.name}</button>
            ))}

        </div>
    )
}