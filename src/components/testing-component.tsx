import { Component } from "solid-js";
import { EthernetFrame, Ethertype, MACAddress } from "../lib/ethernet";
import { BitArray } from "../lib/binary";
import { VLANTag } from "../lib/ethernet/vlan";
import { IPPacketV4 } from "../lib/ip/v4/packet";
import { AddressV4, SubnetMaskV4 } from "../lib/ip/v4";
import { ICMPPacketV4 } from "../lib/ip/v4/icmp";
import { Device } from "../lib/device/device";
import { ARPPacket } from "../lib/ethernet/arp";

const DeviceComponent: Component<{ device: Device }> = ({ device }) => {

    return <div>
        <div>
            <h1>{device.name}</h1>
        </div>
        <div>
            {device.interfaces.map((iface) => (
                <div>
                    <p>MAC address: <span>{iface.macAddress.toString()}</span></p>
                    {iface.ipAddressV4 && iface.subnetMaskV4 && (
                        <p>IPv4 address: <span>{iface.ipAddressV4.toString()}</span>/<span>{iface.subnetMaskV4.length}</span></p>
                    )}
                </div>
            ))}
        </div>
    </div>
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


    let broadcastMACAddress = new MACAddress(new BitArray(1, 6 * 8))

    let arpPacket = new ARPPacket(1,
            iface_pc1.macAddress.bits,
            iface_pc1.ipAddressV4!.bits,
            broadcastMACAddress.bits,
            iface_pc2.ipAddressV4!.bits
        )
    console.log(arpPacket)

    return (
        <div>
            <header>
                <h2>This is a component where trying things are acceptable.</h2>
            </header>

            <div>
                <DeviceComponent device={pc1} />
                <DeviceComponent device={pc2} />
            </div>
        </div>
    )
}