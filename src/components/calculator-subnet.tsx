import { Component, createSignal, For, JSX } from "solid-js";
import { AddressV4, calculateSubnetV4, ClassAddressV4, classesV4, reservedAddresses, SubnetMaskV4, validateDotNotated } from "../lib/ip/v4";
import { BitArray } from "../lib/binary";

const privateUseAddresses = reservedAddresses.filter(([, , scope]) => scope == "PRIVATE_USE").map(([addr]) => new AddressV4(addr));
const defaultSubnet = calculateSubnetV4({
    address: new AddressV4("192.168.76.2"),
    mask: new SubnetMaskV4(26)
})

function getState(options: Parameters<typeof calculateSubnetV4>[0]) {
    let subnet = calculateSubnetV4(options);

    return {
        ...subnet,
        subnetBits: subnet.mask.length - subnet.address.class.networkBitCount,
        subnetBitOptions: new Array(AddressV4.address_length - subnet.address.class.networkBitCount - 1).fill(1).map((_, i) => i),
        maskBits: subnet.mask.length,
        maskBitOptions: new Array(AddressV4.address_length - subnet.address.class.networkBitCount - 1).fill(1).map((_, i) => i + subnet.address.class.networkBitCount),
        maxSubnets: 2 ** (subnet.mask.length - subnet.address.class.networkBitCount),
        maxSubnetOptions: new Array(AddressV4.address_length - subnet.address.class.networkBitCount - 1).fill(0).map((_, i) => 2 ** i),
        hostOptions: new Array(subnet.address.class.hostBitCount - 1).fill(0).map((_, i) => 2 ** (i + 2) - 2),
    }
}

type CalcState = ReturnType<typeof getState>;

function getSubnetBasedOnClass(classV4: ClassAddressV4) {
    let privateUseAddress = privateUseAddresses.find((addr) => addr.class == classV4);
    if (!privateUseAddress) throw new Error("no address found for class: " + classV4.name);
    return {
        address: new AddressV4(privateUseAddress.bits.or(new BitArray(1))),
        mask: new SubnetMaskV4(classV4.networkBitCount)
    }
}

const CalculatorSubnetV4: Component = () => {
    const [state, setState] = createSignal(getState(defaultSubnet), {
        "equals": false
    })

    const handleNetworkClass: JSX.EventHandlerUnion<HTMLInputElement, InputEvent> = (event) => {
        let classV4 = classesV4.find(({ name }) => name == event.currentTarget.value);
        if (!classV4) return;

        setState(getState(getSubnetBasedOnClass(classV4)));
    }

    const handleAddress: JSX.EventHandlerUnion<HTMLInputElement, InputEvent> = (event) => {
        let dotNotated = event.currentTarget.value;
        if (!validateDotNotated(dotNotated)) return; // address is invalid

        setState((prev) => {
            let address = new AddressV4(dotNotated)

            // test if address is in the same class
            if (address.class == prev.address.class) {
                // Same class just update address
                return getState({ address, mask: prev.mask })
            } else {
                let { mask } = getSubnetBasedOnClass(address.class)
                return getState({ mask, address })
            }
        })
    }

    const setSubnetWithNewMask = (mask: SubnetMaskV4, transformer?: (state: ReturnType<typeof getState>) => ReturnType<typeof getState>) => {
        // if mask is for the wrong class 
        if (mask.length < 8) throw new Error("given mask is invalid" + mask)

        setState((prev) => {
            let state: CalcState;
            if (mask.length >= prev.address.class.networkBitCount) {
                state = getState({ mask, address: prev.address })
            } else {
                // get appropriate class for mask 
                let classV4 = classesV4.filter(({ networkBitCount }) => networkBitCount <= mask.length).at(-1)!;
                let { address } = getSubnetBasedOnClass(classV4);
                state = getState({ address, mask })
                return state;
            }

            if (transformer) {
                return transformer(state)
            }
            return state
        })
    }

    const handleMask: JSX.EventHandlerUnion<HTMLInputElement, InputEvent> = (event) => {
        let dotNotated = event.currentTarget.value;
        if (!validateDotNotated(dotNotated)) return; // address is invalid
        let mask = new SubnetMaskV4(dotNotated);

        if (mask.length < 8) {
            // mask is invalid
            return;
        }
        setSubnetWithNewMask(mask)
    }

    const handleSubnetBits: JSX.EventHandlerUnion<HTMLSelectElement, Event> = (event) => {
        let subnetBits = Number(event.currentTarget.value);
        if (isNaN(subnetBits)) return; // invalid value
        let mask = new SubnetMaskV4(state().address.class.networkBitCount + subnetBits);
        setSubnetWithNewMask(mask)
    }

    const handleMaskBits: JSX.EventHandlerUnion<HTMLSelectElement, Event> = (event) => {
        let maskBits = Number(event.currentTarget.value);
        if (isNaN(maskBits)) return // invalid value
        let mask = new SubnetMaskV4(maskBits);
        setSubnetWithNewMask(mask)
    }

    const handleMaxSubnets: JSX.EventHandlerUnion<HTMLSelectElement, Event> = (event) => {
        let maxSubnets = Number(event.currentTarget.value);
        if (isNaN(maxSubnets)) return // invalid value
        // 2**x = maxSubnets || log(maxSubnets) / log(2) = x
        let subnetBits = Math.ceil(Math.log(maxSubnets) / Math.log(2));
        let mask = new SubnetMaskV4(state().address.class.networkBitCount + subnetBits);
        setSubnetWithNewMask(mask)
    }

    const handleHosts: JSX.EventHandlerUnion<HTMLInputElement, InputEvent> = (event) => {
        let hosts = event.currentTarget.valueAsNumber;
        if (isNaN(hosts) || hosts < 1 || hosts > 2 ** (32 - 8) - 2) return;

        // 2**x - 2  = hosts || log(hosts + 2) / log(2) = x
        let hostBits = Math.ceil(Math.log(hosts + 2) / Math.log(2));
        if (2 ** hostBits - 2 == 2 ** (AddressV4.address_length - state().mask.length) - 2) {
            return
        }
        let maskBits = AddressV4.address_length - hostBits;
        let mask = new SubnetMaskV4(maskBits);
        setSubnetWithNewMask(mask, (s) => {
            s.hosts.count = hosts;
            return s;
        })
    }

    // Easter egg
    // randomize the adress keep within subnet
    const randomizeAddress = () => {
        setState(prev => {
            let hostBits = AddressV4.address_length - prev.mask.length;
            let n = Math.round(Math.random() * (2 ** hostBits - 2))
            prev.address = new AddressV4(prev.address.bits.xor(new BitArray(n)))
            return prev;
        })
    }

    // Definitely not heavily inspired by <https://www.subnet-calculator.com/>
    return <form>
        <fieldset>
            <legend>Subnet Calculator IPV4</legend>
            <section>
                <fieldset >
                    <legend>Network Class</legend>
                    <section>
                        {
                            classesV4.map((val, i) => (
                                <label>
                                    {val.name}
                                    <input
                                        onInput={handleNetworkClass}
                                        type="radio"
                                        value={val.name}
                                        name="class"
                                        checked={val === state().address.class}
                                    /*
                                     If classes D & E were added i'd need to disable the due to no private addresses for that class 
                                     */
                                    />
                                </label>
                            ))
                        }
                    </section>
                </fieldset>
            </section>
            <section>
                <fieldset>
                    <legend>IP Address</legend>
                    <input type="text" name="address" value={state().address.toString()} onInput={handleAddress} />
                </fieldset>
                <fieldset>
                    <legend>Subnet Mask</legend>
                    <input type="text" name="mask" list="subnet-mask-list" value={state().mask.toString()} onInput={handleMask} />
                    <datalist id="subnet-mask-list">
                        <For each={state().maskBitOptions}>{(bits) => (
                            <option value={new SubnetMaskV4(bits).toString()} />
                        )}</For>
                    </datalist>
                </fieldset>
            </section>
            <section>
                <fieldset>
                    <legend>Subnet Bits</legend>
                    <select name="subnet-bits" value={state().subnetBits} onInput={handleSubnetBits}>
                        <For each={state().subnetBitOptions}>
                            {(val) => (
                                <option value={val}>{val}</option>

                            )}
                        </For>
                    </select>
                </fieldset>
                <fieldset>
                    <legend>Mask Bits</legend>
                    <select name="mask-bits" value={state().maskBits} onInput={handleMaskBits}>
                        <For each={state().maskBitOptions}>
                            {(val) => (
                                <option value={val}>{val}</option>

                            )}
                        </For>
                    </select>
                </fieldset>
            </section>
            <section>
                <fieldset>
                    <legend>Maximum Subnets</legend>
                    <select name="max-subnets" value={state().maxSubnets} onInput={handleMaxSubnets}>
                        <For each={state().maxSubnetOptions}>
                            {(val) => (
                                <option value={val}>{val}</option>

                            )}
                        </For>
                    </select>
                </fieldset>
                <fieldset>
                    <legend>Hosts</legend>
                    <input type="number" inputMode="numeric" list="host-options" min={0} max={2 ** (32 - 8) - 2} value={state().hosts.count} onInput={handleHosts} />
                    <datalist id="host-options">
                        <For each={state().hostOptions}>
                            {(val) => (
                                <option value={val} />

                            )}
                        </For>
                    </datalist>
                </fieldset>
            </section>
            <section>
                <fieldset>
                    <legend>Host Address Range</legend>
                    <input class="text-center" type="text" readOnly value={`${state().hosts.min} - ${state().hosts.max}`} onClick={randomizeAddress} onFocus={randomizeAddress} />
                </fieldset>
            </section>
            <section>
                <fieldset>
                    <legend>Network Address</legend>
                    <input class="text-center" type="text" readOnly value={state().networkAddress.toString()} />
                </fieldset>
                <fieldset>
                    <legend>Broadcast Address</legend>
                    <input class="text-center" type="text" readOnly value={state().broadcastAddress.toString()} />
                </fieldset>
            </section>
        </fieldset>
    </form>
}

export default CalculatorSubnetV4;