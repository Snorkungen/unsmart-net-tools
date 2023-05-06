import { Component } from "solid-js";
import { EthernetFrame, MACAddress } from "../lib/ethernet";


export const TestingComponent: Component = () => {

    let macAddress = new MACAddress("00:1f:19:ba:20:39");
    let ethernetPacket = new EthernetFrame(macAddress, new MACAddress("00:1f:19:ba:20:37"));

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