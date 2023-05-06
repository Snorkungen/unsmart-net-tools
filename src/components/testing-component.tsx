import { Component } from "solid-js";
import { EthernetFrame, Ethertype, MACAddress } from "../lib/ethernet";
import { BitArray } from "../lib/binary";
import { VLANTag } from "../lib/ethernet/vlan";
import { IPPacketV4 } from "../lib/ip/v4/packet";
import { AddressV4 } from "../lib/ip/v4";


export const TestingComponent: Component = () => {

    let macAddress = new MACAddress("00:1f:19:ba:20:39");
    let ethernetPacket = new EthernetFrame(macAddress, new MACAddress("00:1f:19:ba:20:37"), new Ethertype(0x500), new BitArray(1, 46 * 8));
    let ipPacket = new IPPacketV4(new AddressV4("192.168.1.2"), new AddressV4("192.168.6.2"), 1, new BitArray(0, 1000))

    console.log(ipPacket)

    return (
        <div>
            <header>
                <h2>This is a component where trying things are acceptable.</h2>
            </header>

            <div>
                {macAddress.toString()}
                <section>{ipPacket.source.toString()} =- {ipPacket.destination.toString()} </section>
            </div>
        </div>
    )
}