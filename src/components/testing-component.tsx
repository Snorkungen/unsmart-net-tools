import { Component } from "solid-js";
import { EthernetFrame, Ethertype, MACAddress } from "../lib/ethernet";
import { BitArray } from "../lib/binary";
import { VLANTag } from "../lib/ethernet/vlan";


export const TestingComponent: Component = () => {

    let macAddress = new MACAddress("00:1f:19:ba:20:39");
    let ethernetPacket = new EthernetFrame(macAddress, new MACAddress("00:1f:19:ba:20:37"), new Ethertype(0x500), new BitArray(1, 46 * 8));

    ethernetPacket.vlan = new VLANTag(10)
    console.log(ethernetPacket.vlan.vid.toNumber())
    console.log(ethernetPacket.source.toString())
    ethernetPacket.source = new MACAddress("10:ff:10:22:32:1f")
    console.log(ethernetPacket.source.toString())
    console.log(ethernetPacket)

    return (
        <div>
            <header>
                <h2>This is a component where trying things are acceptable.</h2>
            </header>

            <div>
                {macAddress.toString()}
            </div>
        </div>
    )
}