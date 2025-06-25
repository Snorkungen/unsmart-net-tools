import type { Device, DeviceRoute } from "../device";
import { BaseInterface, DeviceAddress } from "../interface";
import { BaseAddress } from "../../address/base";
import { IPV4Address } from "../../address/ipv4";
import { IPV6Address } from "../../address/ipv6";
import { MACAddress } from "../../address/mac";
import { AddressMask } from "../../address/mask";

export interface StoreValue<T = unknown, P = unknown> {
    serialize(value: T, device?: Device): P; // what is serializable depends could be whatever ...
    deserialize(input: P, device?: Device,): T;
    validate(input: unknown, device?: Device): input is T;

    readonly definition?: StoreValue;
    readonly definitions?: Record<number | string, StoreValue>;
}
export type StoreValueT<T extends StoreValue> = T extends StoreValue<infer P> ? P : never;
export type StoreValueS<P extends StoreValue> = P extends StoreValue<unknown, infer R> ? R : never;

function storev_base_type<T extends unknown>(type: string): StoreValue<T, T> {
    return {
        serialize(value) { return value; },
        deserialize(input) { return input; },
        validate(input): input is T { return typeof input == type },
    }
}

export const storev_number = storev_base_type<number>("number");
export const storev_string = storev_base_type<string>("string");
export const storev_boolean = storev_base_type<boolean>("boolean");

export const storev_bigint: StoreValue<bigint, string> = {
    serialize(value) { return value.toString(); },
    deserialize(input) { return BigInt(input); },
    validate(input) { return typeof input === "bigint" },
}

export function storev_Object<T extends Record<string, StoreValue>>(definition: T): StoreValue<{ [Key in keyof T]: StoreValueT<T[Key]> }, { [Key in keyof T]: StoreValueS<T[Key]> }> {
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
        },
        validate(input, device): input is { [Key in keyof T]: StoreValueT<T[Key]> } {
            if (!this.definitions) return false;
            if (!input || typeof input != "object") return false;

            for (let key in this.definition) {
                if (!this.definitions[key]?.validate((input as any)[key], device)) return false;
            }

            return true;
        },
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
export function storev_Array<T extends unknown, S extends unknown>(definition: StoreValue<T, S>): StoreValue<T[], S[] | [string[], ...unknown[][]]> {
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
        validate(input, device): input is T[] {
            if (!this.definition) return false;
            if (typeof input != "object" || !Array.isArray(input)) return false;

            for (let value of input) {
                if (!this.definition.validate(value, device)) return false;
            }

            return true;
        },
    }
}

export function storev_optional<T extends unknown, S extends unknown>(definition: StoreValue<T, S>): StoreValue<T | null, S | null> {
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
        },
        validate(input, device): input is (T | null) {
            if (!input /* Just check falsy who cares ... */) return true;
            return definition.validate(input, device);
        },
    }
}

/**
 * discrete could also handle the situation above ...
 * 
 * ```ts
 * type V = {
 *  [x: string | number]: "..."
 * }
 * ```
 */
export function storev_discrete<T = unknown, S = unknown>(definition: StoreValue<T, S>): StoreValue<
    { [x: string | number]: T },
    [(string | number)[], ...S[]] | [(string | number)[], (keyof S)[], ...S[keyof S][][]]
> {
    return {
        definition: definition,
        serialize(value, device) {
            let keys = Object.keys(value) as (string | number)[];
            let values = Object.values(value).map(v => this.definition!.serialize(v, device)) as S[];

            // filter keys where values  are falsy
            values = values.filter((_, j) => !!value[keys[j]])
            keys = keys.filter(k => !!value[k]);

            if (this.definition!.definitions) {
                const v_keys = Object.keys(this.definition!.definitions!) as (keyof S)[];
                const flattened_values = values.map<S[keyof S][]>((v) => v_keys.map(k => (v as S)[k]));
                return [keys, v_keys, ...flattened_values];
            }

            return [keys, ...values];
        },
        deserialize(input, device) {
            const keys = input[0];
            const result: { [x: string | number]: T } = {};

            if (this.definition!.definitions) {
                const v_keys = input[1] as (keyof S)[];
                const flattened_values = input.slice(2) as S[keyof S][][];

                for (let i = 0; i < keys.length; i++) {
                    let key = keys[i];
                    result[key] = {} as T;

                    // fill in the keys
                    for (let j = 0; j < v_keys.length; j++) {
                        result[key][v_keys[j] as unknown as keyof T] = (
                            this.definition!.definitions![v_keys[j] as string].deserialize(flattened_values[i][j], device) as T[keyof T]
                        )
                    }
                }

                return result;
            }

            const values = input.slice(1) as S[];
            for (let i = 0; i < keys.length; i++) {
                result[keys[i]] = this.definition!.deserialize(values[i], device) as T;
            }

            return result;
        },
        validate(input, device): input is { [x: string | number]: T } {
            if (!this.definition) return false;
            if (typeof input != "object") return false;

            for (let key in input) {
                if (!this.definition.validate((input as any)[key], device)) return false;
            }

            return true;
        },
    }

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
function storev_create_BaseAddress<T extends typeof BaseAddress>(bound_counstructor: T): StoreValue<InstanceType<T>, [string, ...number[]]> {
    return {
        serialize(value) {
            return [value.constructor.name, ...value.buffer];
        },
        deserialize(input) {
            const constructor = storev_get_address_constructor(input[0]);
            return new constructor(new Uint8Array(input.slice(1) as number[])) as InstanceType<T>;
        },
        validate(input): input is InstanceType<T> {
            return input instanceof bound_counstructor;
        },
    }
}

export const storev_BaseAddress = storev_create_BaseAddress(BaseAddress);
export const storev_IPV4Address = storev_create_BaseAddress(IPV4Address);
export const storev_IPV6Address = storev_create_BaseAddress(IPV6Address);
export const storev_MACAddress = storev_create_BaseAddress(MACAddress);

function storev_create_AddressMask<T extends typeof BaseAddress>(bound_counstructor: T): StoreValue<AddressMask<T>, [string, number]> {
    return {
        serialize(value) { return [value.address.name, value.length] },
        deserialize(input) {
            const constructor = storev_get_address_constructor(input[0]) as T;
            return new AddressMask(constructor, input[1]);
        },
        validate(input): input is AddressMask<T> {
            return ((input instanceof AddressMask) && (input.address instanceof bound_counstructor));
        },
    }
}

export const storev_AddressMask = storev_create_AddressMask(BaseAddress);
export const storev_IPV4Mask = storev_create_AddressMask(IPV4Address);
export const storev_IPV6Mask = storev_create_AddressMask(IPV6Address);

export const storev_BaseInterface: StoreValue<BaseInterface, string> = {
    serialize(value) { return value.id(); },
    deserialize(input, device) {
        if (!device) throw new Error("device required")

        let iface = device.interfaces.find(v => v.id() == input);
        if (!iface) {
            throw new Error("ifid no longer exists on device: " + input);
        }
        return iface;
    },
    validate(input, device): input is BaseInterface {
        if (!(input instanceof BaseInterface)) return false;
        return !device || device != input.device;
    },
}

// !NOTE: this should probably not exist or find a better solution to this pattern to remove repeated values
/** see {@link storev_create_BaseAddress}  */
export const storev_DeviceAddress: StoreValue<DeviceAddress, [string, number, ...number[]]> = {
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
    },
    validate(input): input is DeviceAddress {
        if (typeof input != "object") return false;
        if (!((input as Partial<DeviceAddress>)?.address instanceof BaseAddress)) return false;
        if (!((input as Partial<DeviceAddress>)?.netmask instanceof AddressMask)) return false;
        return true;
    },
}

export const storev_DeviceRoute: StoreValue<DeviceRoute> = storev_Object({
    destination: storev_BaseAddress,
    gateway: storev_BaseAddress,
    netmask: storev_AddressMask,

    // !NOTE: this was a poor choice since all it actually cares about is truthy or falsy
    f_static: storev_optional(storev_boolean) as StoreValue<true | undefined>,
    f_gateway: storev_optional(storev_boolean) as StoreValue<true | undefined>,
    f_host: storev_optional(storev_boolean) as StoreValue<true | undefined>,

    iface: storev_BaseInterface,
});