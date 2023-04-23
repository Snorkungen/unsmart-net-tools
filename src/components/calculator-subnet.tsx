import { Button, Col, Form, InputGroup, Row, Table } from "solid-bootstrap";
import { Component, createSignal, For, JSX, Show } from "solid-js";
import { AddressV4, calculateSubnetV4, SubnetMaskV4, validateDotNotated } from "../lib/ip/v4";
console.log(new SubnetMaskV4("255.255.255.0"))
const CalculatorSubnetV4: Component = () => {
    const [enabled, setEnabled] = createSignal(true)
    let [subnet, setSubnet] = createSignal<ReturnType<typeof calculateSubnetV4> | null>(null);

    const handleSubmit: JSX.EventHandlerUnion<HTMLFormElement, Event & { submitter: HTMLElement; }> = (event) => {
        event.preventDefault();
        let formData = new FormData(event.currentTarget)
        let address = new AddressV4(formData.get("address") as string);
        let mask = new SubnetMaskV4(formData.get("mask") as string);

        console.log(formData.get("mask"))

        setSubnet(
            calculateSubnetV4({ address, mask })
        )
    }

    const handleInputOnChange: JSX.EventHandlerUnion<HTMLElement, Event> = (event) => {
        if (!(event.currentTarget instanceof HTMLInputElement)) {
            return
        }

        setEnabled(validateDotNotated(event.currentTarget.value))
    }

    return <Form onSubmit={handleSubmit}>
        <InputGroup size="sm" class="mb-3">
            <Form.Control onInput={handleInputOnChange} name="address" type="text" value={"192.168.24.1"} />
            <Form.Select value={"255.255.255.0"} name="mask" >
                <For each={new Array(32).fill(0).map((_, i) => new SubnetMaskV4(i + 1))}>
                    {(mask) => (
                        <option value={mask.toString()}>/{mask.length}</option>
                    )}
                </For>
            </Form.Select>
        </InputGroup>
        <Form.Group>
            <Button disabled={!enabled()} type="submit">Submit</Button>
        </Form.Group>
        <Show when={subnet()}>
            <div class="mt-3"> 
                <Row class="pt-2">
                    <Col>Address:</Col>
                    <Col class="text-end"><span>{subnet()!.address.toString()}</span></Col>
                </Row>
                <Row class="pt-2">
                    <Col>Network Address:</Col>
                    <Col class="text-end"><span>{subnet()!.networkAddress.toString()}</span></Col>
                </Row>
                <Row class="pt-2">
                    <Col>Broadcast Address:</Col>
                    <Col class="text-end"><span>{subnet()!.broadcastAddress.toString()}</span></Col>
                </Row>
                <Row class="pt-2">
                    <Col>Host Range:</Col>
                    <Col class="text-end"><span>{subnet()!.hosts.min.toString()}</span> - <span>{subnet()!.hosts.max.toString()}</span></Col>
                </Row>
                <Row class="pt-2">
                    <Col>Host Count:</Col>
                    <Col class="text-end"><span>{subnet()!.hosts.count}</span></Col>
                </Row>
                <Row class="pt-2">
                    <Col>Mask:</Col>
                    <Col class="text-end"><span>{subnet()!.mask.toString()}</span></Col>
                </Row>
                <Row class="pt-2">
                    <Col>Mask Length:</Col>
                    <Col class="text-end"><span>{subnet()!.mask.length.toString()}</span></Col>
                </Row>
            </div>
        </Show>
    </Form>
}

export default CalculatorSubnetV4;