import { Component, createMemo, createSignal, For, JSX, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { AddressV4, calculateSubnetV4, ClassAddressV4, classesV4, reservedAddresses, SubnetMaskV4, validateDotNotated } from "../lib/ip/v4";
import { BitArray } from "../lib/binary";

const privateUseAddresses = reservedAddresses.filter(([, , scope]) => scope == "PRIVATE_USE").map(([addr]) => new AddressV4(addr));
const defaultSubnet = calculateSubnetV4({
    address: new AddressV4("192.168.76.2"),
    mask: new SubnetMaskV4(26)
})

function getSubnetBasedOnClass(classV4: ClassAddressV4) {
    let privateUseAddress = privateUseAddresses.find((addr) => addr.class == classV4);
    if (!privateUseAddress) throw new Error("no address found for class: " + classV4.name);
    return {
        address: new AddressV4(privateUseAddress.bits.or(new BitArray(1))),
        mask: new SubnetMaskV4(classV4.networkBitCount)
    }
}

const CalculatorSubnetV4: Component = () => {
    const [subnet, setSubnet] = createStore(defaultSubnet)

    const handleNetworkClass: JSX.EventHandlerUnion<HTMLInputElement, InputEvent> = (event) => {
        let classV4 = classesV4.find(({ name }) => name == event.currentTarget.value);
        if (!classV4) return;

        setSubnet(calculateSubnetV4(getSubnetBasedOnClass(classV4)));
    }

    const handleAddress: JSX.EventHandlerUnion<HTMLInputElement, InputEvent> = (event) => {
        let dotNotated = event.currentTarget.value;
        if (!validateDotNotated(dotNotated)) return; // address is invalid
        let address = new AddressV4(dotNotated)

        // test if address is in the same class
        if (address.class == subnet.address.class) {
            // Same class just update address
            setSubnet({ address })
        } else {
            let { mask } = getSubnetBasedOnClass(address.class);
            setSubnet({ address, mask })
        }
    }

    const setSubnetWithNewMask = (mask : SubnetMaskV4) => {
        // if mask is for the wrong class 
        if (mask.length >= subnet.address.class.networkBitCount) {
            setSubnet((_) => calculateSubnetV4({ mask, address: _.address }))
        } else {
            // get appropriate class for mask 
            let classV4 = classesV4.filter(({ networkBitCount }) => networkBitCount <= mask.length).at(-1)!;
            let { address } = getSubnetBasedOnClass(classV4);
            setSubnet(calculateSubnetV4({ address, mask }))
        }
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

    // issues below
    const handleSubnetBits: JSX.EventHandlerUnion<HTMLSelectElement, Event> = (event) => {
        let subnetBits = Number(event.currentTarget.value);
        if (isNaN(subnetBits)) return; // invalid value
        let mask = new SubnetMaskV4(subnet.address.class.networkBitCount + subnetBits); 
        console.log(event.currentTarget)
        setSubnetWithNewMask(mask)
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
                                        checked={val === subnet.address.class}
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
                    <input type="text" name="address" value={subnet.address.toString()} onInput={handleAddress} />
                </fieldset>
                <fieldset>
                    <legend>Subnet Mask</legend>
                    <input type="text" name="mask" value={subnet.mask.toString()} onInput={handleMask} />
                </fieldset>
            </section>
            <section>
                <fieldset>
                    <legend>Subnet Bits</legend>
                    <select name="subnet-bits" value={(subnet.mask.length - subnet.address.class.networkBitCount)} onChange={handleSubnetBits}>
                        {new Array(AddressV4.address_length - subnet.address.class.networkBitCount - 1).fill(1).map((_, i) => i).map((v) => (
                            <option value={v}>{v}</option>
                        ))}
                    </select>
                </fieldset>
                <fieldset>
                    <legend>Mask Bits</legend>
                    <select name="mask-bits" value={subnet.mask.length}>
                        {new Array(AddressV4.address_length - 7).fill(1).map((_, i) => i + 8).map((v) => (
                            <option value={v}>/{v}</option>
                        ))}
                    </select>
                </fieldset>
            </section>
            <section>
                <fieldset>
                    <legend>Maximum Subnets</legend>
                    <select name="max-subnets" value={2 ** (subnet.mask.length - subnet.address.class.networkBitCount)} >
                        {new Array(AddressV4.address_length - subnet.address.class.networkBitCount - 1).fill(0).map((_, i) => 2 ** i).map((v) => (
                            <option value={v}>{v}</option>
                        ))}
                    </select>
                </fieldset>
                <fieldset>
                    <legend>Hosts **</legend>
                    <input type="number" min={0} max={2 ** (32 - 8) - 2} value={subnet.hosts.count} />
                </fieldset>
            </section>
            <section>
                <fieldset>
                    <legend>Host Address Range</legend>
                    <input class="text-center" type="text" readOnly value={`${subnet.hosts.min} - ${subnet.hosts.max}`} />
                </fieldset>
            </section>
            <section>
                <fieldset>
                    <legend>Network Address</legend>
                    <input class="text-center" type="text" readOnly value={subnet.networkAddress.toString()} />
                </fieldset>
                <fieldset>
                    <legend>Broadcast Address</legend>
                    <input class="text-center" type="text" readOnly value={subnet.broadcastAddress.toString()} />
                </fieldset>
            </section>
        </fieldset>
    </form>
}

export default CalculatorSubnetV4;