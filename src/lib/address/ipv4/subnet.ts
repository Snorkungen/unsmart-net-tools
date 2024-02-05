import { or, not } from "../../binary/buffer-bitwise";
import { IPV4Address } from "../ipv4";
import { AddressMask } from "../mask";

export function calculateSubnetIPV4<Address extends typeof IPV4Address>(address: InstanceType<Address>, aMask: AddressMask<Address>) {
    let networkAddress = aMask.mask(address),
        broadcastAddress = new IPV4Address(
            or(networkAddress.buffer, not(aMask.buffer))
        );

    let minHostAddress = new IPV4Address(
        networkAddress
    ), maxHostAddress = new IPV4Address(
        broadcastAddress
    );

    minHostAddress.buffer[3] = minHostAddress.buffer[3] | 1;
    maxHostAddress.buffer[3] = maxHostAddress.buffer[3] ^ 1;

    return {
        address: new IPV4Address(address),
        mask: aMask,
        networkAddress: networkAddress,
        broadcastAddress: broadcastAddress,

        hosts: {
            count: 2 ** (IPV4Address.ADDRESS_LENGTH - aMask.length) - 2,
            min: minHostAddress,
            max: maxHostAddress
        }
    }
}