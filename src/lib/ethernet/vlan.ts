// <https://en.wikipedia.org/wiki/IEEE_802.1Q>

import { BitArray } from "../binary";

export class VID {
    static address_length = 12;
    bits = new BitArray(0, VID.address_length);

    constructor(input: number | BitArray = 0) {
        // invalid input defaults to vid 0
        if (input instanceof BitArray) {
            if (input.size != VID.address_length) return;
        } else if (input < 1 || input > 4094) {
            return;
        }

        this.bits = this.bits.or(new BitArray(input));
    }

    toNumber() {
        return this.bits.toNumber()
    }
    toString(radix?: number) {
        return this.bits.toString(radix)
    }
}

// <https://en.wikipedia.org/wiki/IEEE_P802.1p>
export class PCP {
    static address_length = 3;
    bits = new BitArray(0, PCP.address_length);

    constructor(input: number | BitArray = 0) {
        if (input instanceof BitArray) {
            if (input.size != VID.address_length) return;
        } else if (input < 0 || input > 7) {
            // invalid input defaults to 0
            return;
        }

        this.bits = this.bits.or(new BitArray(input));
    }

    toNumber() {
        return this.bits.toNumber()
    }
    toString(radix?: number) {
        return this.bits.toString(radix)
    }
}

// Drop eligible indicator default to zero i have no clue what i'm doing.
const DEI = new BitArray(0);


export class VLANTag {
    static address_length = 32;
    // Tag protocol identifier
    static TPID = new BitArray(0, 16).or(new BitArray(0x8100)); // 16 bits 0x8100

    bits: BitArray;

    constructor(vid: number | VLANTag, pcp: number | PCP = 0, dei: 0 | 1 = 0) {
        if (typeof vid == "number") {
            vid = new VLANTag(vid)
        }

        if (typeof pcp == "number") {
            pcp = new PCP(pcp);
        }


        this.bits = VLANTag.TPID.concat(pcp.bits, new BitArray(dei), vid.bits)
    }

    get pcp(): PCP {
        return new PCP(this.bits.slice(16, 16 + PCP.address_length));
    }

    get dei(): boolean {
        return !!this.bits.slice(18, 19).toNumber(); // 0 | 1
    }

    get vid(): VID {
        return new VID(this.bits.slice(20));
    }
}


// In future add double tagging  Service VLAN