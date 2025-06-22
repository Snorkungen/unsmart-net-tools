/*
    -----------------------------
    The limit shall be 300 LOC
    -----------------------------

    Why this file exists has not been understood.

    NOTE: optimisation refers to the final JSON bytes size
*/

import type { Device, DeviceRoute } from "../device";
import type { BaseInterface, DeviceAddress } from "../interface";
import { BaseAddress } from "../../address/base";
import { IPV4Address } from "../../address/ipv4";
import { IPV6Address } from "../../address/ipv6";
import { MACAddress } from "../../address/mac";
import { AddressMask } from "../../address/mask";

interface StoreValue<T = unknown, P = unknown> {
    serialize(value: T, device?: Device): P; // what is serializable depends could be whatever ...
    deserialize(input: P, device?: Device,): T;

    readonly definition?: StoreValue; // and then this would recursively call  serialize and deserialize on theme kids ...
    readonly definitions?: Record<number, StoreValue>;
}

type StoreValueT<T extends StoreValue> = T extends StoreValue<infer P> ? P : never;
type StoreValueS<P extends StoreValue> = P extends StoreValue<unknown, infer R> ? R : never

function storev_Object<T extends Record<string, StoreValue>>(definition: T): StoreValue<{ [Key in keyof T]: StoreValueT<T[Key]> }, { [Key in keyof T]: StoreValueS<T[Key]> }> {
    return {
        definitions: definition,
        serialize(value, device) {
            let result: any = {};
            for (let key in this.definitions!) {
                result[key] = this.definitions[key as any].serialize(value[key], device)
            }
            return result;
        },
        deserialize(input, device) {
            let result: any = {};
            for (let key in this.definitions!) {
                result[key] = this.definitions[key].deserialize(input[key], device)
            }
            return result as { [Key in keyof T]: StoreValueT<T[Key]> };
        }
    }
}

/**
 * Optimisation: if the value is an object serialize to the following format
 * ```js
 * [keys, ...serialized_values]
 * [["a", "b", "c"], [32, 9, 0], [32, 9, 0]]
 * ```
 * NOTE: this thing is lying about the types ... so they should probably be opaque
 */
function storev_Array<T extends unknown, S extends unknown>(definition: StoreValue<T, S>): StoreValue<T[], S[] | [string[], ...unknown[][]]> {
    return {
        definition: definition,
        serialize(value, device) {
            if (this.definition!.definitions) {
                let keys = Object.keys(this.definition!.definitions!);
                let values = value.map(v => v ? // to support having an optional value ...
                    keys.map(k => this.definition!.definitions![k as any].serialize((v as any)[k]), device)
                    : null
                )
                return [keys, ...values] as S[];
            }

            return value.map(v => this.definition!.serialize(v, device)) as [string[], [string[], ...unknown[][]]];
        },
        deserialize(input, device) {
            if (this.definition!.definitions) {
                let keys = input[0] as string[];
                let rest = input.slice(1);
                return rest.map(v => {
                    if (!v) return null; // to support having an optional value ...

                    let result: any = {};
                    for (let i = 0; i < keys.length; i++) {
                        result[keys[i]] = this.definition!.definitions![keys[i] as any].deserialize((v as any)[i], device);
                    }
                    return result;
                }) as T[]
            }
            return input.map(v => this.definition!.deserialize(v, device)) as T[];
        },
    }
}

function storev_optional<T extends unknown, S extends unknown>(definition: StoreValue<T, S>): StoreValue<T | null, S | null> {
    // This solution is a hack in order to get storev_Arrays optimiasation to work
    return {
        ...definition,
        serialize(value, device) {
            if (!value) return null;
            return definition.serialize(value, device) as S;
        },
        deserialize(input, device) {
            if (!input) return null;
            return definition.deserialize(input, device) as T;
        }
    }
}

// !TODO: the types do not really work how the should, the key should be able to be narrowed to either number or string
/**
 * discrete could also handle the situation above ...
 * 
 * ```ts
 * type V = {
 *  [x: string | number]: "..."
 * }
 * ```
 */
function storev_discrete<T = unknown, S = unknown>(definition: StoreValue<T, S>): StoreValue<
    { [x: string | number]: T },
    [(string | number)[], ...S[]]
> {
    return {
        definition: definition,
        serialize(value, device) {
            // !TODO: recreate the same optimisation as in Array for objects
            let keys = Object.keys(value) as (string | number)[];
            let values = Object.values(value).map(v => this.definition!.serialize(v, device)) as S[];
            return [keys, ...values];
        },
        deserialize(input, device) {
            // !TODO: recreate the same optimisation as in Array for objects
            const keys = input[0];
            const values = input.slice(1) as S[];

            const result: { [x: string | number]: T } = {};
            for (let i = 0; i < keys.length; i++) {
                result[keys[i]] = this.definition!.deserialize(values[i], device) as T;
            }

            return result;
        },
    }

}

const storev_base_type: StoreValue<unknown, unknown> = {
    serialize(value) { return value; },
    deserialize(input) { return input; },
}

const storev_number = storev_base_type as StoreValue<number, number>;
const storev_string = storev_base_type as StoreValue<string, string>;
const storev_boolean = storev_base_type as StoreValue<boolean, boolean>;

const storev_bigint: StoreValue<bigint, string> = {
    serialize(value) { return value.toString(); },
    deserialize(input) { return BigInt(input); }
}

function storev_get_address_constructor(constructor_name: string): typeof BaseAddress {
    if (constructor_name === MACAddress.name) {
        return MACAddress;
    } else if (constructor_name == IPV4Address.name) {
        return IPV4Address;
    } else if (constructor_name == IPV6Address.name) {
        return IPV6Address;
    } else if (constructor_name == BaseAddress.name) {
        return BaseAddress;
    }

    throw new Error(`constructor unknown: ${constructor_name}`);
}

/** 
 * bytes are for interopability with the actual BaseInterface which only supports Uint8Array as input
 * [\<constructor\>.name, ...bytes ] 
*/
const storev_BaseAddress: StoreValue<BaseAddress, [string, ...number[]]> = {
    serialize(value) {
        return [value.constructor.name, ...value.buffer]
    },
    deserialize(input) {
        const constructor_name = input[0];
        const bytes = new Uint8Array(input.slice(1) as number[])
        const constructor = storev_get_address_constructor(constructor_name);
        return new constructor(bytes);
    }
}

const storev_IPV4Address = storev_BaseAddress as StoreValue<IPV4Address>;
const storev_IPV6Address = storev_BaseAddress as StoreValue<IPV6Address>;
const storev_MACAddress = storev_BaseAddress as StoreValue<MACAddress>;

const storev_AddressMask: StoreValue<AddressMask<typeof BaseAddress>, [string, number]> = {
    serialize(value) {
        return [value.address.name, value.length];
    },
    deserialize(input) {
        const constructor = storev_get_address_constructor(input[0]);
        const length = input[1];
        return new AddressMask(constructor, length);
    }
}

/** see {@link storev_BaseAddress}  */
const storev_DeviceAddress: StoreValue<DeviceAddress, [string, number, ...number[]]> = {
    serialize(value) {
        return [value.address.constructor.name, value.netmask.length, ...value.address.buffer]
    },
    deserialize(input) {
        const constructor = storev_get_address_constructor(input[0]);
        const bytes = new Uint8Array(input.slice(2) as number[])
        return {
            address: new constructor(bytes),
            netmask: new AddressMask(constructor, input[1]),
        };
    }
}

const storev_IPV4Mask = storev_AddressMask as StoreValue<AddressMask<typeof IPV4Address>>;
const storev_IPV6Mask = storev_AddressMask as StoreValue<AddressMask<typeof IPV6Address>>;

const storev_BaseInterface: StoreValue<BaseInterface, string> = {
    serialize(value) { return value.id(); },
    deserialize(input, device) {
        if (!device) throw new Error("device required")

        let iface = device.interfaces.find(v => v.id() == input);
        if (!iface) {
            throw new Error("ifid no longer exists on device: " + input);
        }
        return iface;
    },
}

const storev_DeviceRoute: StoreValue<DeviceRoute> = storev_Object({
    destination: storev_BaseAddress,
    gateway: storev_BaseAddress,
    netmask: storev_AddressMask,

    // !NOTE: this was a poor choice since all it actually cares about is truthy or falsy
    f_static: storev_optional(storev_boolean) as StoreValue<true | undefined>,
    f_gateway: storev_optional(storev_boolean) as StoreValue<true | undefined>,
    f_host: storev_optional(storev_boolean) as StoreValue<true | undefined>,

    iface: storev_BaseInterface,
})

export {
    type StoreValue,
    type StoreValueT,
    type StoreValueS,
    storev_number,
    storev_string,
    storev_boolean,
    storev_bigint,
    storev_Array,
    storev_Object,
    storev_optional,
    storev_discrete,
    storev_BaseAddress,
    storev_IPV4Address,
    storev_IPV6Address,
    storev_MACAddress,
    storev_AddressMask,
    storev_IPV4Mask,
    storev_IPV6Mask,
    storev_DeviceAddress,
    storev_BaseInterface,
    storev_DeviceRoute,
}
