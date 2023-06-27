import { and } from "../binary/buffer-bitwise";
import { BaseAddress } from "./base";

/*
    I'm bored and i enjoy confusing future self with unnecessary Typescripting
*/

export function createMaskBuffer<Address extends typeof BaseAddress>(addressLength: Address["ADDRESS_LENGTH"], maskLength: number): Buffer {
    let buffer = Buffer.alloc(addressLength / 8);

    if (maskLength < 0 || maskLength > addressLength) {
        // maybe throw error
        return buffer;
    }

    let i = 0;
    while (maskLength > 0) {
        if (maskLength >= 8) {
            maskLength -= 8;
            buffer[i] = 0xff;
        } else {
            // below works but, kinda' sus.
            buffer[i] = 0xff << (8 - maskLength)
            maskLength = 0;
        }

        i++;
    }

    return buffer;
};


/**
 * negative return value means some type of error
 * @param buffer 
 * @returns length
 */
export function calculateMaskBufferLength<Address extends BaseAddress>(buffer: Address["buffer"]): number {
    let length = 0;

    for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] == 0xff) {
            length += 8;
        } else if (buffer[i] == 0) {
            break;
        } else switch (buffer[i]) {
            case (0xfe): return length + 7;
            case (0xfc): return length + 6;
            case (0xf8): return length + 5;
            case (0xf0): return length + 4;
            case (0xe0): return length + 3;
            case (0xc0): return length + 2;
            case (0x80): return length + 1;
            default: return -1;
        }
    }

    return length;
}

export class AddressMask<Address extends typeof BaseAddress>  {
    private address: Address;
    buffer: Buffer;

    constructor(address: Address, input: number | ReturnType<typeof createMaskBuffer<Address>> | InstanceType<Address> | string) {
        this.address = address;

        if (typeof input == "number") {
            this.buffer = createMaskBuffer(address.ADDRESS_LENGTH, input);
        } else if (input instanceof Buffer) {
            this.buffer = input;
        } else if (input instanceof this.address) {
            this.buffer = input.buffer;
        } else if (typeof input == "string") {
            this.buffer = this.address.parse(input)
        } else {
            throw new Error("failed to initlialize " + AddressMask.name)
        }
    }

    /**
     * this functions checks wether the mask is actually valid and makes sense. If this class was initiated by user input.
     * @returns boolean
     */
    isValid(): boolean {
        // check if buffer length makes sense.
        if (this.buffer.length != (this.address.ADDRESS_LENGTH / 8)) {
            return false;
        }

        // check if the length which is calculated is not negative
        if (this.length < 0) {
            console.log("I am the reson", this.buffer)
            return false;
        }

        return true;
    }

    compare<A extends InstanceType<Address>>(address1: A, address2: A): boolean {
        return and(this.buffer, address1.buffer).toString("hex") ==
            and(this.buffer, address2.buffer).toString("hex")
    }

    /**
     * IDK This will probly be permanently temporary
     */
    mask<A extends InstanceType<Address>>(address: A): A {
        return (new this.address(and(this.buffer, address.buffer))) as A;
    }

    get length(): number {
        return calculateMaskBufferLength(this.buffer);
    }

    toAddress<A extends InstanceType<Address>>(): A {
        // #TRUSMEBRO
        return (new this.address(this.buffer)) as A;
    }

    toString(): string {
        return this.toAddress().toString()
    }
}

export function createMask<Address extends typeof BaseAddress>(address: Address, input: ConstructorParameters<typeof AddressMask<Address>>[1], validate = true): AddressMask<Address> {
    let mask = new AddressMask<Address>(address, input);

    if (validate && !mask.isValid()) {
        throw new Error("created " + AddressMask.name + " is not valid.")
    }

    return mask;
}

createMask(BaseAddress, 2)