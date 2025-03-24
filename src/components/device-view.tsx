import type { DOMElement, JSX } from "solid-js/jsx-runtime";
import { Contact, type Device } from "../lib/device/device"
import { DEVICE_PROGRAM_DOWNLOAD } from "../lib/device/program/program";
import { headless_ping_receive, headless_ping_send } from "../lib/device/program/ping";
import { IPV4Address } from "../lib/address/ipv4";
import { IPV6Address } from "../lib/address/ipv6";
import { createSignal, onCleanup, onMount } from "solid-js";
import { EthernetInterface } from "../lib/device/interface";

type _E = Event & {
    currentTarget: HTMLAnchorElement;
    target: DOMElement;
}

function handle_download(device: Device) {
    return (ev: _E) => {
        device.process_start(DEVICE_PROGRAM_DOWNLOAD);
        ev.preventDefault();
    }
}

function handle_ping(device: Device) {
    return () => {
        let ip = prompt("Please enter a destination ip, from: " + device.name)
        if (!ip) return;

        let destination: IPV4Address | IPV6Address;
        let contact: Contact | undefined;
        let identifier = Math.floor(Math.random() * (0xffff));

        if (IPV4Address.validate(ip)) {
            contact = device.contact_create("IPv4", "RAW").data!;
            destination = new IPV4Address(ip);
        } else if (IPV6Address.validate(ip)) {
            contact = device.contact_create("IPv6", "RAW").data!;
            destination = new IPV6Address(ip);
        } else {
            return;
        }

        let route = device.route_resolve(destination);
        if (!route) {
            return;
        }

        let closed = false;
        let t = window.setTimeout(() => {
            if (closed) return;
            contact && contact.close(contact);
        }, 5 * 1000); // close contact after 5-minutes

        function success() {
            console.log("%c ECHO Reply recieved: " + device.name, ['background: green', 'color: white', 'display: block', 'text-align: center', 'font-size: 24px'].join(';'))
            contact && contact.close(contact)
            closed = true;
            window.clearTimeout(t);
        }

        function error() {
            console.log("%c ECHO error recieved: " + device.name, ['background: red', 'color: white', 'display: block', 'text-align: center', 'font-size: 24px'].join(';'))
            contact && contact.close(contact)
            closed = true;
            window.clearTimeout(t);
        }

        contact.receive(contact, headless_ping_receive(destination, route, identifier, success, error));
        headless_ping_send(contact, destination, route, 1, identifier);
    }
}

const selectContents = (ev: MouseEvent) => {
    if (!(ev.currentTarget instanceof HTMLElement)) return;
    let range = document.createRange();
    range.selectNode(ev.currentTarget);
    window.getSelection()?.addRange(range);
}

type DeviceViewComponentProps = {
    device: Device;
    on_select?: (device: Device) => void;

}

export function DeviceViewComponent({ device, on_select }: DeviceViewComponentProps): JSX.Element {
    const [ifaces, set_ifaces] = createSignal(device.interfaces, { equals: () => false })

    const handle_interface_events = () => {
        set_ifaces(device.interfaces);
    }

    onMount(() => {
        device.event_add_handler("interface_add", handle_interface_events)
        device.event_add_handler("interface_remove", handle_interface_events)
        device.event_add_handler("interface_set_address", handle_interface_events)
        device.event_add_handler("interface_mcast_subscribe", handle_interface_events)
        device.event_add_handler("interface_mcast_unsubscribe", handle_interface_events)

    });

    onCleanup(() => {
        device.event_remove_handler(handle_interface_events)
    })

    return <div>
        <div style={{ display: "flex", "justify-content": "space-between", "align-items": "end" }}>
            <h2 onclick={() => on_select && on_select(device)} >{device.name}</h2>
            <div style={{ gap: "1em", display: "flex" }}>
                <button onclick={handle_ping(device)}>ping</button>

                <a href="" onClick={handle_download(device)}>Download</a>
            </div>
        </div>
        {ifaces().map(iface => (
            <div style={{ display: "flex", "flex-direction": "row", "justify-content": "left", gap: "1em" }}>
                <strong>{iface.id()}: </strong>
                <span>{iface.up ? "up" : "down"} </span>
                {iface instanceof EthernetInterface && (
                    <>
                        <span onClick={selectContents}>{iface.macAddress.toString()}</span>
                        {iface.vlan && (
                            <span>vlan {iface.vlan.type} {iface.vlan.vids.join()}</span>
                        )}
                    </>
                )}
                {(() => {
                    let source4 = iface.addresses.find(a => a.address instanceof IPV4Address), source6 = iface.addresses.find(a => a.address instanceof IPV6Address);
                    return (<>
                        {source4 && <span><span onClick={selectContents}>{source4.address.toString()}</span>/<span>{source4.netmask.length}</span> </span>}
                        {source6 && <span><span onClick={selectContents}>{source6.address.toString()}</span>/<span>{source6.netmask.length}</span> </span>}
                    </>)
                })()}
            </div>
        ))}
    </div>
}