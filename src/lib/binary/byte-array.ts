

export class ByteArray {

    bytes = new Uint8Array(2);
    constructor(input: number)
    constructor(input: unknown) {

        if (typeof input == "number" && !isNaN(input) && input >= 0) {

            let size = Math.floor(Math.pow(input, 1 / 2)) / 8;
            this.bytes = new Uint8Array(size)

            // i wanted mess aruound with numbers but this is just easier
            let hexString = input.toString(16);
            if ((hexString.length & 1) == 1) {
                hexString = "0" + hexString;
            }

            for (let i = 0; i < this.bytes.byteLength; i++) {
                this.bytes[i] = parseInt(hexString.substring((i * 2), (i * 2) + 2), 16)
            }

        } else {
            throw new Error("failed to parse input: " + input)
        }

        console.log(this.toNumber())

    }




    toNumber() {
        // i want to do cool stuff with numbers
        let hexString = ""

        for (let i = this.bytes.byteLength - 1; i >= 0; i--) {
            // this is dumb why not just mess with numbers it's more fun
            if ((hexString.length & 1) == 1) {
                hexString = "0" + hexString
            }
            hexString = this.bytes[i].toString(16) + hexString
        }

        return parseInt(hexString, 16);
    }
}