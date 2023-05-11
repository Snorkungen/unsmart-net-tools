// <https://en.wikipedia.org/wiki/IEEE_802.1Q>

import { BitArray } from "../binary";
import { ETHER_TYPES } from "./types";

const TPID_BITS = new BitArray(0, 16).or(new BitArray(ETHER_TYPES.VLAN)) // Tag protocol identifier
const PCP_BITS = new BitArray(0, 3) // <https://en.wikipedia.org/wiki/IEEE_P802.1p>
const DEI_BITS = new BitArray(0, 1)
const VID_BITS = new BitArray(0, 12)

export class VLANTag {
    static address_length = TPID_BITS.size + PCP_BITS.size + DEI_BITS.size + VID_BITS.size;
    bits: BitArray;

    constructor(vid: number | BitArray, pcp: number = 0, dei: 0 | 1 = 0) {
        if (vid instanceof BitArray && vid.size == VLANTag.address_length) {
            this.bits = vid;
        } else if (typeof vid == "number" && vid >= 1 && vid <= 9094 && pcp >= 0 && vid <= 7) {
            this.bits = TPID_BITS.concat(
                PCP_BITS.or(new BitArray(pcp)),
                DEI_BITS.or(new BitArray(pcp)),
                VID_BITS.or(new BitArray(vid)),
            )
        }

        throw new Error("failed to create VLANTag")
    }

    get pcp(): number {
        return this.bits.slice(TPID_BITS.size, TPID_BITS.size + DEI_BITS.size).toNumber();
    }

    get dei(): boolean {
        return !!this.bits.slice(18, 19).toNumber(); // 0 | 1
    }

    get vid(): number {
        return this.bits.slice(20).toNumber();
    }
}


// In future add double tagging  Service VLAN