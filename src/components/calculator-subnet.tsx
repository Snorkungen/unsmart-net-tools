import { Button, Col, Form, InputGroup, Row, Table } from "solid-bootstrap";
import { Component, createSignal, For, JSX, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { AddressV4, calculateSubnetV4, IpV4Class, SubnetMaskV4, validateDotNotated } from "../lib/ip/v4";

let defaultSubnet = calculateSubnetV4({
    address: new AddressV4("192.168.76.2"),
    mask: new SubnetMaskV4(24)
})
const CalculatorSubnetV4: Component = () => {
    const [subnet] = createStore(defaultSubnet)




    // Definitely not heavily inspired by <https://www.subnet-calculator.com/>
    return <form>
        <fieldset>
            <legend>Subnet Calculator IPV4</legend>
            <section>
                <fieldset >
                    <legend>Network Class</legend>
                    <section>
                        {
                            ["A", "B", "C", "D", "E"].map((val, i) => (
                                <label>
                                    {val}
                                    <input
                                        type="radio"
                                        name="class"
                                        checked={val === subnet.address.class}
                                        disabled={i > 2} // disabled for classes "D" | "E" because no valid private addresses
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
                    <input type="text" name="address" value={subnet.address.toString()} />
                </fieldset>
                <fieldset>
                    <legend>Subnet Mask</legend>
                    <input type="text" name="mask" value={subnet.mask.toString()} />
                </fieldset>
            </section>
            <section>
                <fieldset>
                    <legend>Subnet Bits</legend>
                    <select name="subnet-bits" value={AddressV4.address_length - subnet.mask.length}>
                        {new Array(AddressV4.address_length - 7).fill(1).map((_, i) => i).map((v) => (
                            <option value={v}>/{v}</option>
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
                    <select name="max-subnets" >
                        // can't be bothered right now
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
                    <input class="text-center" type="text" disabled value={`${subnet.hosts.min} - ${subnet.hosts.max}`} />
                </fieldset>
            </section>
            <section>
                <fieldset>
                    <legend>Network Address</legend>
                    <input class="text-center" type="text" disabled value={subnet.networkAddress.toString()} />
                </fieldset>
                <fieldset>
                    <legend>Broadcast Address</legend>
                    <input class="text-center" type="text" disabled value={subnet.broadcastAddress.toString()} />
                </fieldset>
            </section>
        </fieldset>
    </form>
}

export default CalculatorSubnetV4;