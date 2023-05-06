import { BitArray } from "../binary";
import { MACAddress } from "./mac";

// 802.3 Ethernet packet and frame structure 

export class EthernetFrame {

    bits: BitArray;
    private offset = 0 // 64 eight bytes if i added preamble and sfd

    constructor(destination: MACAddress, source: MACAddress,)
    constructor(destination: MACAddress, source: MACAddress,) {
        this.bits = destination.bits.
            concat(source.bits)

        console.log(this.bits.toString())
    }


    get destination(): MACAddress {
        return new MACAddress(this.bits.slice(this.offset + 0, this.offset + MACAddress.address_length));
    }
    
    get source(): MACAddress {
        return new MACAddress(this.bits.slice(this.offset + MACAddress.address_length, this.offset + MACAddress.address_length * 2));
    }
}

// ignore but have 
// preamble 56 bits of 10101010... pattern
let preamble = new BitArray("10101010101010101010101010101010101010101010101010101010", 2);
// start frame delimeter  This might aswell be wrong wikipedia is the greatest source ever created
let sfd = new BitArray("10101011", 2);