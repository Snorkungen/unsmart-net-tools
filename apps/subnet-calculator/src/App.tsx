import { Component, createSignal, For, JSX } from "solid-js";
import { calculateSubnetIPV4, classifyIPV4Address, IPV4_CLASSESS, IPV4Address, IPV4AddressClass, reservedAddresses ,AddressMask, createMask} from "address";
import { from, mutateAnd, not, or } from "uint8array-utils";

const privateUseAddresses = reservedAddresses.filter(([, , scope]) => scope == "PRIVATE_USE");
const defaultSubnetParams: Parameters<typeof calculateSubnetIPV4> = [new IPV4Address("192.168.76.2"), createMask(IPV4Address, 26)]

function getState(...params: Parameters<typeof calculateSubnetIPV4>) {
    let subnet = calculateSubnetIPV4(...params),
        addressClass = classifyIPV4Address(subnet.address);
    return {
        ...subnet,
        subnetBits: subnet.mask.length - addressClass.networkBitCount,
        subnetBitOptions: new Array(IPV4Address.ADDRESS_LENGTH - addressClass.networkBitCount - 1).fill(1).map((_, i) => i),
        maskBits: subnet.mask.length,
        maskBitOptions: new Array(IPV4Address.ADDRESS_LENGTH - addressClass.networkBitCount - 1).fill(1).map((_, i) => i + addressClass.networkBitCount),
        maxSubnets: 2 ** (subnet.mask.length - addressClass.networkBitCount),
        maxSubnetOptions: new Array(IPV4Address.ADDRESS_LENGTH - addressClass.networkBitCount - 1).fill(0).map((_, i) => 2 ** i),
        hostOptions: new Array(addressClass.hostBitCount - 1).fill(0).map((_, i) => 2 ** (i + 2) - 2),
    }
}

type CalcState = ReturnType<typeof getState>;

function getSubnetParamsBasedOnClass(addrClass: IPV4AddressClass): Parameters<typeof calculateSubnetIPV4> {
    let privateUseAddress = privateUseAddresses.find(([addr]) => classifyIPV4Address(new IPV4Address(addr)) == addrClass);
    if (!privateUseAddress) throw new Error("no address found for class: " + addrClass.name);

    let address = new IPV4Address(privateUseAddress[0]);
    address.buffer[3] = address.buffer[3] | 1

    return [
        address,
        createMask(IPV4Address, addrClass.networkBitCount)
    ]
}

export const App: Component = () => {
    const [state, setState] = createSignal<CalcState>(getState(...defaultSubnetParams))

    const handleNetworkClass: JSX.EventHandler<HTMLInputElement, InputEvent> = (event) => {
        let addressClass = IPV4_CLASSESS.find(c => c.name == event.currentTarget.value);
        if (!addressClass) return;

        setState(getState(...getSubnetParamsBasedOnClass(addressClass)));
    }

    const handleAddress: JSX.EventHandler<HTMLInputElement, InputEvent> = (event) => {
        let dotNotated = event.currentTarget.value;
        if (!IPV4Address.validate(dotNotated)) return; // addres is invalid

        setState(prev => {
            let address = new IPV4Address(dotNotated);
            let addrClass = classifyIPV4Address(address),
                prevAddrClass = classifyIPV4Address(prev.address);

            if (addrClass == prevAddrClass) {
                return getState(address, prev.mask);
            } else {
                let [, mask] = getSubnetParamsBasedOnClass(addrClass);
                return getState(address, mask);
            }
        })
    }

    const setSubnetWithNewMask = (mask: AddressMask<typeof IPV4Address>, transformer?: (state: CalcState) => CalcState) => {
        // if mask is for the wrong class 
        if (mask.length < 8) throw new Error("given mask is invalid" + mask)

        setState(prev => {
            let state: CalcState;
            let addrClass = classifyIPV4Address(prev.address);
            if (mask.length >= addrClass.networkBitCount) {
                state = getState(prev.address, mask);
            } else {
                // get appropriate class for mask 
                addrClass = IPV4_CLASSESS.filter(({ networkBitCount }) => networkBitCount <= mask.length).at(-1)!;
                let [address] = getSubnetParamsBasedOnClass(addrClass);
                state = getState(address, mask);
            }

            if (transformer) return transformer(state);
            return state;
        })
    }

    const handleMask: JSX.EventHandler<HTMLInputElement, InputEvent> = (event) => {
        let dotNotated = event.currentTarget.value;
        if (!IPV4Address.validate(dotNotated)) return; // address is invalid

        let mask = createMask(IPV4Address, dotNotated, false);
        if (mask.length < 8 || !mask.isValid()) {
            // mask is invalid
            return;
        }
        setSubnetWithNewMask(mask);
    }

    const handleSubnetBits: JSX.EventHandler<HTMLSelectElement, Event> = event => {
        let subnetBits = Number(event.currentTarget.value);
        if (isNaN(subnetBits)) return;
        let addrClass = classifyIPV4Address(state().address);
        let mask = createMask(IPV4Address, subnetBits + addrClass.networkBitCount);
        setSubnetWithNewMask(mask);
    }

    const handleMaskBits: JSX.EventHandler<HTMLSelectElement, Event> = event => {
        let maskBits = Number(event.currentTarget.value);
        if (isNaN(maskBits)) return;
        let mask = createMask(IPV4Address, maskBits);
        setSubnetWithNewMask(mask);
    }

    const handleMaxSubnets: JSX.EventHandler<HTMLSelectElement, Event> = event => {
        let maxSubnets = Number(event.currentTarget.value);
        if (isNaN(maxSubnets)) return;
        // 2**x = maxSubnets || log(maxSubnets) / log(2) = x
        let subnetBits = Math.ceil(Math.log(maxSubnets) / Math.log(2));
        let addrClass = classifyIPV4Address(state().address);
        let mask = createMask(IPV4Address, subnetBits + addrClass.networkBitCount);
        setSubnetWithNewMask(mask);
    }

    const handleHosts: JSX.EventHandler<HTMLInputElement, Event> = event => {
        let hosts = event.currentTarget.valueAsNumber;
        if (isNaN(hosts) || hosts < 1 || hosts > 2 ** (IPV4Address.ADDRESS_LENGTH - 8) - 2) return;
        // 2**x - 2  = hosts || log(hosts + 2) / log(2) = x
        let hostBits = Math.ceil(Math.log(hosts + 2) / Math.log(2));
        if (2 ** hostBits - 2 == 2 ** (IPV4Address.ADDRESS_LENGTH - state().mask.length)) {
            return;
        }
        let maskBits = IPV4Address.ADDRESS_LENGTH - hostBits;
        let mask = createMask(IPV4Address, maskBits);
        setSubnetWithNewMask(mask, (s) => {
            s.hosts.count = hosts;
            return s;
        });
    }

    // Easter egg
    // randomize the adress keep within subnet
    const randomizeAddress = () => {
        setState(prev => {
            let buf = mutateAnd(
                from(Math.ceil(Math.random() * (2 ** (IPV4Address.ADDRESS_LENGTH - prev.mask.length) - 2)), 4).reverse(),
                not(prev.mask.buffer)
            )

            return {
                ...prev,
                address: new IPV4Address(or(buf, prev.mask.mask(prev.address).buffer))
            };
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
                            IPV4_CLASSESS.map((val, i) => (
                                <label>
                                    {val.name}
                                    <input
                                        onInput={handleNetworkClass}
                                        type="radio"
                                        value={val.name}
                                        name="class"
                                        checked={val === classifyIPV4Address(state().address)}
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
                            <option value={createMask(IPV4Address, bits).toString()} />
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
                    <input class="text-center" type="text" readOnly value={`${state().hosts.min} - ${state().hosts.max}`} onClick={randomizeAddress} /* onFocus={randomizeAddress} */ />
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
};

export default App;