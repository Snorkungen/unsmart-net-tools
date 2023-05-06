import { Component } from "solid-js";
import { EthernetFrame, Ethertype, MACAddress } from "../lib/ethernet";
import { BitArray } from "../lib/binary";
import { VLANTag } from "../lib/ethernet/vlan";
import { IPPacketV4 } from "../lib/ip/v4/packet";
import { AddressV4 } from "../lib/ip/v4";
import { ICMPPacketV4 } from "../lib/ip/v4/icmp";


export const TestingComponent: Component = () => {

    let macAddress = new MACAddress("00:1f:19:ba:20:39");
    
    let icmpPacket = new ICMPPacketV4(8, 0)
    let ipPacket = new IPPacketV4(new AddressV4("192.168.1.2"), new AddressV4("192.168.6.2"), 1, icmpPacket.bits)
    let ethernetPacket = new EthernetFrame(macAddress, new MACAddress("00:1f:19:ba:20:37"), new Ethertype(0x500), ipPacket.bits);

    console.log(icmpPacket)
    console.log(ipPacket)
    console.log(ethernetPacket)

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