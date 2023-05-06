import { Component } from "solid-js";
import { EthernetFrame, Ethertype, MACAddress } from "../lib/ethernet";
import { BitArray } from "../lib/binary";


export const TestingComponent: Component = () => {

    let macAddress = new MACAddress("00:1f:19:ba:20:39");
    let ethernetPacket = new EthernetFrame(macAddress, new MACAddress("00:1f:19:ba:20:37"),new Ethertype(0x500), new BitArray(1,46 * 8));

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