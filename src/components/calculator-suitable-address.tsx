import { Component, createSignal, JSX, Show } from "solid-js";
import { BitArray } from "../lib/binary";
import { AddressV4, calculateSubnetV4, SubnetMaskV4 } from "../lib/ip/v4";
import { reservedAddresses } from "../lib/ip/v4/reserved";




export const CalculatorSuitableAddressV4: Component = () => {
    const [subnet, setSubnet] = createSignal<ReturnType<typeof calculateSubnetV4> | null>(null)

    const handleSubmit: JSX.EventHandlerUnion<HTMLFormElement, Event> = (event) => {
        event.preventDefault();
        let formData = new FormData(event.currentTarget);
        let hosts: unknown = formData.get("hosts");

        if (typeof hosts == "string") {
            hosts = parseInt(hosts);
        }

        if (!(typeof hosts == "number" && !isNaN(hosts))) {
            return
        }

        if (hosts > 2 ** (32 - 8) - 2) {
            throw "hosts to large impossible"
        }

        // 2**x = hosts || log(hosts) / log(2) = x
        let minMaskLength = 32 - Math.ceil(Math.log(hosts) / Math.log(2));

        // using a bunch of assumptions
        let addressOptions = reservedAddresses.filter(([, len, scope]) => scope == "PRIVATE_USE" && len < minMaskLength);

        if (addressOptions.length == 0) {
            throw "impossible"
        }

        let [addressString, maskLength] = addressOptions[addressOptions.length - 1];

        let address = new AddressV4(addressString);

        // address = new AddressV4(address.bits
        //     .xor(new BitArray(1, Math.round(Math.random() * 32 - maskLength))
        //         .xor(new BitArray(1, 2))))

        let mask = new SubnetMaskV4(minMaskLength);
        let subnet = calculateSubnetV4({ address, mask });

        setSubnet(subnet)
    }

    return <form onSubmit={handleSubmit}>
        <fieldset>
            <input name="hosts" type="number" inputMode="numeric" min={0} max={2 ** (32 - 8) - 2} value={254} />
            <button type="submit" >Calculate</button>
        </fieldset>

        <Show when={subnet()}>
            <div>
                <div>
                    <p>Address: <span style={{ float: "inline-end" }}>{subnet()!.address.toString()}</span></p>
                </div>
                <div>
                    <p>Network Address: <span style={{ float: "inline-end" }}>{subnet()!.networkAddress.toString()}</span></p>
                </div>
                <div>
                    <p>Broadcast Address: <span style={{ float: "inline-end" }}>{subnet()!.broadcastAddress.toString()}</span></p>
                </div>
                <div>
                    <p>Address Range: <span style={{ float: "inline-end" }}>{subnet()!.hosts.min.toString()} - {subnet()!.hosts.max.toString()} </span></p>
                </div>
                <div>
                    <p>Host Count: <span style={{ float: "inline-end" }}>{subnet()!.hosts.count}</span></p>
                </div>
                <div>
                    <p>Subnet Mask Length: <span style={{ float: "inline-end" }}>{subnet()!.mask.length}</span></p>
                </div>
                <div>
                    <p>Subnet Mask: <span style={{ float: "inline-end" }}>{subnet()!.mask.toString()}</span></p>
                </div>
            </div>
        </Show>
    </form >
}