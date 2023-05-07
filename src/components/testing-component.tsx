import { Component } from "solid-js";
import { EthernetFrame, Ethertype, MACAddress } from "../lib/ethernet";
import { BitArray } from "../lib/binary";
import { VLANTag } from "../lib/ethernet/vlan";
import { IPPacketV4 } from "../lib/ip/v4/packet";
import { AddressV4, SubnetMaskV4 } from "../lib/ip/v4";
import { ICMPPacketV4 } from "../lib/ip/v4/icmp";
import { Device } from "../lib/device/device";
import { ARPPacket } from "../lib/ethernet/arp";
import { Interface } from "../lib/device/interface";

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



let broadcastMACAddress = new MACAddress(new BitArray(1, 6 * 8))

function sendARPRequest(targetIp: AddressV4, device: Device) {
    // iface_pc1 send arp looking for iface_pc 2

    // just because this is the testing component i know what interface to use
    let iface = device.interfaces[0];
    if (!iface.isConnected || !iface.ipAddressV4) {
        return null;
    }

    // sender is iface_pc1

    let arpPacket = new ARPPacket(
        1, // request
        iface.macAddress.bits,
        iface.ipAddressV4!.bits,
        broadcastMACAddress.bits,
        targetIp.bits
    )

    // wrap packet in ethernet frame
    // ether type should be an enum
    let ethernetFrame = new EthernetFrame(broadcastMACAddress, iface.macAddress, new Ethertype(0x0806), arpPacket.bits)
    iface.send(ethernetFrame)
    // true means no problems as of what it knows
    return true;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function getMACAddressForTargetIP(targetIp: AddressV4, device: Device): Promise<[MACAddress, Interface]> {
    return await new Promise(async (resolve, reject) => {
        // first check arp table
        let arpTableQuery = device.arpTable.get(targetIp);

        if (arpTableQuery.length) {
            // just return first answer
            let q = arpTableQuery[0];
            // should rename theese its a confusion
            let macAddress = q.address;

            let iface = device.interfaces[q.ifID];
            if (!iface) {
                // failed because interface doesnt exist
                return reject()
            }
            return resolve([macAddress, iface]);
        }

        // now send an arp request
        if (!sendARPRequest(targetIp, device)) {
            // this case meanse there was problem
            return reject()
        }

        // wait a few milliseconds to resend again
        await sleep(100);
        return resolve(await getMACAddressForTargetIP(targetIp, device))
    })
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

    async function sendFirstICMPV4Packet() {
        let targetIp = iface_pc2.ipAddressV4!
        let senderDevice = pc1;

        let [targetMACAddress, iface] = await getMACAddressForTargetIP(targetIp, senderDevice);

        if (!iface.isConnected || !iface.ipAddressV4 || !iface.subnetMaskV4) {
            // failed because interface does not have ipv4 configured
            return;
        }

        // create ping packet
        // the code should also be an enum 
        // i don't remember why i created content
        let icmpPacket = new ICMPPacketV4(8, 0,)
        // protocol should be an enum
        let ipPacket = new IPPacketV4(iface.ipAddressV4, targetIp, 0x01, icmpPacket.bits);
        let ethernetFrame = new EthernetFrame(targetMACAddress, iface.macAddress, new Ethertype(0x0800 /* SHOULD be an enum */), ipPacket.bits);

        iface.send(ethernetFrame); 
    }

    return (
        <div>
            <header>
                <h2>This is a component where trying things are acceptable.</h2>
            </header>

            <div>
                <DeviceComponent device={pc1} />
                <DeviceComponent device={pc2} />
            </div>
            <button onClick={sendFirstICMPV4Packet}>Send first packet</button>
        </div>
    )
}