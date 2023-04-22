
// https://www.w3schools.com/js/js_bitwise.asp

export const BIT_STRING_REGEX = /^[0-1]*$/i
export const HEX_STRING_REGEX = /^(\d|[A-F])*$/i


export const EXPORTED_TEXT = "This text is exported."
/**
 * This class is not good but i'm sonewhat bored and not in the mood to do this properly
 * this class has all the methods so consumers do not have to care about underlying logic
*/
export class BitArray {
    private array: Array<boolean> = [false]; // default to prevent NaN

    /**
     * this function i want to take an initializing value like number string of 1's and 0's aswell as take itself as an initializer
    */
    constructor(input: number | string | BitArray | BitArray["array"]) {
        // Just to get started lets start by taking a number or a BitArray

        // JavaScript has some idiosyncrasies
        if (typeof input == "number" && !isNaN(input)) {
            this.array = numberToArrayOfBooleans(input)
        } else if (typeof input == "string") {
            // test if bit string or hex string
            if (BIT_STRING_REGEX.test(input)) this.array = bitStringToArrayOfBooleans(input)
            else if (HEX_STRING_REGEX.test(input)) this.array = hexStringToArrayOfBooleans(input)
        } else if (input instanceof BitArray) {
            this.array = input.array;
        } else if (Array.isArray(input)) {
            // should probably verify that input is contains the correct values but can't be bothered
            this.array = input;
        }
    }

    get size() {
        return this.array.length;
    }
    /**
     * NOTE! overwrites data
     */
    set size(size: number) {
        this.array.length = size
    }

    slice(start?: number | undefined, end?: number | undefined) {
        return new BitArray(this.array.slice(start, end));
    }

    concat(...items: BitArray[]) {
        return new BitArray(this.array.concat(...items.map(({ array }) => array)))
    }



    // Bit_Wise operation
    // diff is for comparing arrays of different lengths
    or(bitArray: BitArray) {
        let size = Math.max(this.size, bitArray.size);
        let array = new Array<boolean>(size);

        let diff = this.size - bitArray.size;

        if (diff > 0) {
            // this.size is larger than bitArray.size
            for (let i = array.length - 1; i >= 0; i--) {
                array[i] = !!(this.array[i] || bitArray.array[i - diff]);
            }
        } else {
            // this.size is smaller than bitArray.size
            for (let i = array.length - 1; i >= 0; i--) {
                array[i] = !!(this.array[i + diff] || bitArray.array[i]);
            }
        }


        return new BitArray(array);
    }

    xor(bitArray: BitArray) {
        let size = Math.max(this.size, bitArray.size);
        let array = new Array<boolean>(size);

        let diff = this.size - bitArray.size;

        // this.size is larger than bitArray.size
        if (diff > 0) for (let i = array.length - 1; i >= 0; i--) {
            // xor is annoying
            array[i] = !!((this.array[i] || bitArray.array[i - diff]) && !(this.array[i] && bitArray.array[i - diff]));
        }
        // this.size is smaller than bitArray.size
        else for (let i = array.length - 1; i >= 0; i--) {
            array[i] = !!((this.array[i + diff] || bitArray.array[i]) && !(this.array[i + diff] && bitArray.array[i]));
        }


        return new BitArray(array);
    }

    and(bitArray: BitArray) {
        let size = Math.max(this.size, bitArray.size);
        let array = new Array<boolean>(size);

        let diff = this.size - bitArray.size;

        // this.size is larger than bitArray.size
        if (diff > 0) for (let i = array.length - 1; i >= 0; i--) {
            array[i] = !!(this.array[i] && bitArray.array[i - diff]);
        }
        // this.size is smaller than bitArray.size
        else for (let i = array.length - 1; i >= 0; i--) {
            array[i] = !!(this.array[i + diff] && bitArray.array[i]);
        }


        return new BitArray(array);
    }

    not() {
        let array = new Array(this.size);

        for (let i = 0; i < array.length; i++) {
            array[i] = !this.array[i]
        }

        return new BitArray(array);
    }


    toNumber() {
        return parseInt(this.toString(2), 2)
    }

    toString(radix = 10) {
        let bitString = "";
        for (let v of this.array) {
            bitString += v ? "1" : "0";
        }
        switch (radix) {
            case 2:
                return bitString;
            case 16:
                return parseInt(bitString, 2).toString(16)
            default: return parseInt(bitString, 2).toString()
        }
    }
}

function numberToArrayOfBooleans(num: number): BitArray["array"] {
    let bitString = num.toString(2)
    return bitStringToArrayOfBooleans(bitString);
}

function hexStringToArrayOfBooleans(hexString: string) {
    let bitString = parseInt(hexString, 16).toString(2);
    return bitStringToArrayOfBooleans(bitString);
}

function bitStringToArrayOfBooleans(bitString: string): BitArray["array"] {
    let array = new Array<boolean>(bitString.length);

    for (let i = 0; i < array.length; i++) {
        array[i] = bitString[i] == "1"
    }

    return array;
}

