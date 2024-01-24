import { Component, JSX } from "solid-js";
import { Device } from "../lib/device/device";
import { AddressMask, createMask } from "../lib/address/mask";
import { IPV4Address } from "../lib/address/ipv4";
import { IPV6Address } from "../lib/address/ipv6";
import { ContactAddrFamily, ContactProto } from "../lib/device/contact/contact";
import { UNSET_IPV4_ADDRESS } from "../lib/device/contact/contacts-handler";
import { uint8_concat, uint8_fromNumber, uint8_readUint16BE } from "../lib/binary/uint8-array";
import { ICMPV4_TYPES, ICMPV6_TYPES, ICMP_ECHO_HEADER, ICMP_HEADER } from "../lib/header/icmp";
import { calculateChecksum } from "../lib/binary/checksum";
import { IPV6_HEADER, IPV6_PSEUDO_HEADER, PROTOCOLS, createIPV4Header } from "../lib/header/ip";
import { Interface } from "../lib/device/interface";
import { DeviceRoute, DeviceRouteFlag } from "../lib/device/routing-table";
import { and, or } from "../lib/binary";
const selectContents = (ev: MouseEvent) => {
    if (!(ev.currentTarget instanceof HTMLElement)) return;
    let range = document.createRange();
    range.selectNode(ev.currentTarget);
    window.getSelection()?.addRange(range);
}

const DeviceComponent: Component<{ device: Device }> = ({ device }) => {

    return <div>
        <div style={{ display: "flex", "justify-content": "space-between" }}>
            <h1>{device.name}</h1>
            <a href="" onClick={ev => {
                let f = device.createCaptureFile();
                if (!f) return alert("No content to dowload"), ev.preventDefault()
                ev.currentTarget.download = f.name;
                ev.currentTarget.href = URL.createObjectURL(f);
            }}>Download</a>
        </div>
        <div>
            {device.interfaces.map((iface) => (
                <div>
                    <h5>{iface.ifID}</h5>
                    <p>MAC address: <span onClick={selectContents}>{iface.macAddress.toString()}</span></p>
                    {iface.ipv4Address && iface.ipv4SubnetMask && (
                        <p>IPv4 address: <span onClick={selectContents}>{iface.ipv4Address.toString()}</span>/<span>{iface.ipv4SubnetMask.length}</span></p>
                    )}
                    {iface.ipv6Address && iface.prefixLength && (
                        <p>IPv6 address: <span onClick={selectContents}>{iface.ipv6Address.toString(4)}</span>/<span>{iface.prefixLength}</span></p>
                    )}
                    <p>is connected: {iface.isConnected + ""}</p>
                </div>
            ))}
        </div>
    </div>
}

let pc1_routes: DeviceRoute[] = [],
    pc2_routes: DeviceRoute[] = []

function setIP4Address(routes: DeviceRoute[], iface: Interface, address: IPV4Address, netmask: AddressMask<typeof IPV4Address>) {
    // there would be logic for removing routes that would no longer work

    iface.ipv4Address = address;
    iface.ipv4SubnetMask = netmask;

    // add net id to routes
    let destination = new IPV4Address(and(address.buffer, netmask.buffer));
    let gateway = new IPV4Address("0.0.0.0");

    let flags: DeviceRouteFlag[] = [];

    if (iface.isConnected) {
        flags.push(DeviceRouteFlag.UP)
    }

    let ridx = routes.push({ destination, netmask, gateway, flags, iface }) - 1;

    iface.onConnect = () => {
        routes[ridx].flags.push(DeviceRouteFlag.UP)
    }

    iface.onDisconnect = () => {
        routes[ridx].flags = routes[ridx].flags.filter((v) => v != DeviceRouteFlag.UP);
    }

    return ridx;
}

let pc1 = new Device();
let pc2 = new Device();
pc1.name = "PC1"
pc2.name = "PC2"

let iface_pc1 = pc1.createInterface();
let iface_pc2 = pc2.createInterface();

setIP4Address(
    pc1_routes,
    iface_pc1,
    new IPV4Address("192.168.1.10"),
    createMask(IPV4Address, 24)
)

setIP4Address(
    pc2_routes,
    iface_pc2,
    new IPV4Address("192.168.1.20"),
    createMask(IPV4Address, 24)
)

iface_pc1.connect(iface_pc2);

console.log(pc1_routes, pc2_routes)

function screamToEchoUDPServer(pc: Device) {
    let contact = pc.contactsHandler.createContact(ContactAddrFamily.IPv4, ContactProto.UDP);

    contact.recieveFrom = (_, data) => {
        console.log(new IPV4Address(data.subarray(0, 4)).toString())
        contact.close();
    }

    let s = contact.sendTo({
        address: iface_pc1.ipv4Address!,
        port: SERVER_PORT,
        proto: ContactProto.UDP,
        addrFamily: ContactAddrFamily.IPv4
    }, uint8_fromNumber(0xdeadf00d));

    if (!s) {
        contact.close();
        console.log("failed to send")
    }
}

// UDP server respond with address and port
const SERVER_PORT = 3640; // ECHO
let serverContact = pc1.contactsHandler.createContact(ContactAddrFamily.IPv4, ContactProto.UDP);
if (!serverContact.bind({
    address: UNSET_IPV4_ADDRESS,
    port: SERVER_PORT,
})) {
    throw "failed to bind"
}

serverContact.recieveFrom = (caddr, _) => {
    console.info("[UDP_ECHO_SERVER] recieved request ... responding")
    serverContact.sendTo(caddr, uint8_concat([
        caddr.address.buffer,
        uint8_fromNumber(caddr.port, 2)
    ]))
}

// TESTING END

export const TestingComponent: Component = () => {

    return (
        <div>
            <header>
                <h2>This is a component where trying things are acceptable.</h2>
            </header>
            <div>
                <DeviceComponent device={pc1} />
                <DeviceComponent device={pc2} />
            </div>

            {[pc1, pc2].map((device) => (
                <div>
                    <button onClick={async () => {
                        let ip = prompt("Please enter a destination ip, from: " + device.name)
                        if (!ip) return;

                        function success() {
                            console.log("%c ECHO Reply recieved: " + device.name, ['background: green', 'color: white', 'display: block', 'text-align: center', 'font-size: 24px'].join(';'))
                        }
                        let identifier = Math.floor(Math.random() * 1_000), sequence = 1;

                        let echoHdr = ICMP_ECHO_HEADER.create({
                            id: identifier,
                            seq: sequence
                        })

                        if (IPV4Address.validate(ip)) {
                            let contact = device.contactsHandler.createContact(ContactAddrFamily.IPv4, ContactProto.RAW);
                            contact.recieve = () => {
                                contact.close();
                                success()
                            };

                            let icmpHdr = ICMP_HEADER.create({
                                type: ICMPV4_TYPES.ECHO_REQUEST,
                                data: echoHdr.getBuffer()
                            });

                            icmpHdr.set("csum", calculateChecksum(icmpHdr.getBuffer()));

                            let ipHdr = createIPV4Header({
                                saddr: UNSET_IPV4_ADDRESS,
                                daddr: new IPV4Address(ip),
                                proto: PROTOCOLS.ICMP,
                                payload: icmpHdr.getBuffer()
                            })

                            contact.send(ipHdr.getBuffer());

                        } else if (/* IPV6Address.validate(ip) */ true) {
                            let contact = device.contactsHandler.createContact(ContactAddrFamily.IPv6, ContactProto.RAW);
                            contact.recieve = () => {
                                contact.close();
                                success()
                            };

                            let icmpHdr = ICMP_HEADER.create({
                                type: ICMPV6_TYPES.ECHO_REQUEST,
                                data: echoHdr.getBuffer()
                            });

                            let pseudoHdr = IPV6_PSEUDO_HEADER.create({
                                saddr: device.interfaces[0].ipv6Address!,
                                daddr: new IPV6Address(ip),
                                len: icmpHdr.size,
                                proto: PROTOCOLS.IPV6_ICMP,
                            })

                            icmpHdr.set("csum", calculateChecksum(uint8_concat([pseudoHdr.getBuffer(), icmpHdr.getBuffer()])));

                            let ipHdr = IPV6_HEADER.create({
                                saddr: device.interfaces[0].ipv6Address!,
                                daddr: new IPV6Address(ip),
                                nextHeader: PROTOCOLS.IPV6_ICMP,
                                payload: icmpHdr.getBuffer()
                            })

                            contact.send(ipHdr.getBuffer());
                        }


                    }}>Ping from: {device.name}</button>

                    <button onClick={() => {
                        screamToEchoUDPServer(device)
                    }}>Send to ECHO Server</button>
                </div>
            ))}
        </div>
    )
}