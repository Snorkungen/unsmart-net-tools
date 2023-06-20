export class ByteArray {
    private array: Uint8Array;

    constructor(input: string, radix: 2 | 16);
    constructor(input: 0 | 1, reapeat: number);
    constructor(input: number | ByteArray | ByteArray["array"]);
    constructor(input: unknown, num: number = -1) {
        if (typeof input == "number" && !isNaN(input)) {
            // create a repeating data 1111111
            if (num > 0 && (input == 0 || input == 1)) {
                this.array = new Uint8Array(new Array(num).fill(!!input ? 255 : 0))
            } else {
                this.array = hexStringToUint8Array(input.toString(16))
            }
        } else if (typeof input == "string") {
            if (num > 2) {
                this.array = hexStringToUint8Array(input)
            } else {
                this.array = bitStringToUint8Array(input)
            }
        } else if (input instanceof Uint8Array) {
            this.array = input;
        } else if (input instanceof ByteArray) {
            this.array = input.array.slice();
        } else {
            throw new Error("Not Implemented")
        }
    }

    get size(): number {
        return this.array.length;
    }
    /**
    * NOTE! overwrites data
    */
    set size(size: number) {
        this.array = new Uint8Array(size)
    }

    slice(start?: number | undefined, end?: number | undefined) {
        return new ByteArray(this.array.slice(start, end));
    }

    /**
 *  only way to modify the data
 * @param start 
 * @param deleteCount 
 */
    splice(start: number, deleteCount?: number): ByteArray;
    splice(start: number, deleteCount: number, ...items: ByteArray[]): ByteArray;
    splice(start: number, deleteCount: number, ...items: ByteArray[]): ByteArray {
        let firstHalf = this.array.slice(0, start),
            deleted = this.array.slice(start, start + deleteCount),
            lastHalf = this.array.slice(start + deleteCount );

        let arrays = items.map(({ array }) => array)
        arrays.unshift(firstHalf), arrays.push(lastHalf);
        let arraysTotalLength = arrays.reduce((sum, { length }) => sum + length, 0);
        this.array = new Uint8Array(arraysTotalLength);

        let i = 0, a = 0;
        while (a < arrays.length) {
            for (let j = 0; j < arrays[a].length; j++) {
                this.array[i + j] = arrays[a][j];
            }

            i += arrays[a].length, a++
        }

        return new ByteArray(deleted);
    }

    concat (...items: ByteArray[]) : ByteArray {
        let arrays = items.map(({ array }) => array)
        arrays.unshift(this.array);
        let array = new Uint8Array(arrays.reduce((sum, { length }) => sum + length, 0));
        let i = 0, a = 0;
        while (a < arrays.length) {
            for (let j = 0; j < arrays[a].length; j++) {
                array[i + j] = arrays[a][j];
            }

            i += arrays[a].length, a++
        }
        return new ByteArray(array)
    }


    // Bit_Wise operation

    // or(): IByteArray
    // xor(): IByteArray
    // and(): IByteArray
    // not(): IByteArray

    // lShift(): IByteArray;
    // rShift(): IByteArray;

    toNumber() {
        return parseInt(this.toString(16), 16)
    }

    toString(radix: 2 | 16 = 16): string {
        let hexString = "";
        for (let v of this.array) {
            hexString += v.toString(16)
        }

        switch (radix) {
            case 2:
                let bitString = ""
                for (let c of hexString) {
                    bitString += parseInt(c, 16).toString(2)
                }
                return bitString;
            case 16:
                return hexString;
            default: return parseInt(hexString, 2).toString()
        }
    }
}

function bitStringToUint8Array(bitString: string): Uint8Array {
    // remove white space
    bitString = bitString.replace(/\W*/g, "")
    let array = new Uint8Array(Math.ceil(bitString.length / 8));

    for (let i = bitString.length; i > 0; i -= 8) {
        array[Math.floor((i - 1) / 8)] = parseInt(bitString.substring(i - 8, i), 2)
    }

    return array;
}
function hexStringToUint8Array(hexString: string): Uint8Array {
    // remove white space
    hexString = hexString.replace(/\W*/g, "")
    let array = new Uint8Array(Math.ceil(hexString.length / 2));

    for (let i = hexString.length; i > 0; i -= 2) {
        array[Math.floor((i - 1) / 2)] = parseInt(hexString.substring(i - 2, i), 16)
    }

    return array;
}