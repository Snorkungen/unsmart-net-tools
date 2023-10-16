import { BaseAddress } from "../address/base";
import { IPV4Address } from "../address/ipv4";
import { IPV6Address } from "../address/ipv6";
import { MACAddress } from "../address/mac";
import { StructType } from "../binary/struct"

export const defineAddress = <AT extends typeof BaseAddress>(Address: AT) => {
    return <StructType<InstanceType<AT>>>{
        bitLength: Address.ADDRESS_LENGTH,
        getter(buffer) {
            return <InstanceType<AT>>(new Address(buffer))
        },
        setter(value) {
            return value.buffer;
        },
    }
}


export const IPV4_ADDRESS = defineAddress(IPV4Address);
export const IPV6_ADDRESS = defineAddress(IPV6Address);
export const MAC_ADDRESS = defineAddress(MACAddress);