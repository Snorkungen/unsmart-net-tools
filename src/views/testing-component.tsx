import { Component } from "solid-js";
import { createMask } from "../lib/address/mask";
import { IPV4Address } from "../lib/address/ipv4";
import { IPV6Address } from "../lib/address/ipv6";
import { uint8_concat, uint8_equals, uint8_fromNumber, uint8_readUint16BE } from "../lib/binary/uint8-array";
import { ICMPV4_TYPES, ICMPV6_TYPES, ICMP_ECHO_HEADER, ICMP_HEADER } from "../lib/header/icmp";
import { calculateChecksum } from "../lib/binary/checksum";
import { IPV4_HEADER, IPV6_HEADER, IPV6_PSEUDO_HEADER, PROTOCOLS, createIPV4Header } from "../lib/header/ip";
import { Device2, EthernetInterface, createMacAddress } from "../lib/device/device2";
import { DEVICE_PROGRAM_DOWNLOAD } from "../lib/device/program/program2";
import { DAEMON_ECHO_REPLIER } from "../lib/device/program/echo-replier";
import { NetworkSwitch2 } from "../lib/device/network-switch";
const selectContents = (ev: MouseEvent) => {
    if (!(ev.currentTarget instanceof HTMLElement)) return;
    let range = document.createRange();
    range.selectNode(ev.currentTarget);
    window.getSelection()?.addRange(range);
}

const DeviceComponent: Component<{ device: Device2 }> = ({ device }) => {
    // HACKY BS
    device.process_start(DAEMON_ECHO_REPLIER);

    return <div>
        <div style={{ display: "flex", "justify-content": "space-between" }}>
            <h1>{device.name}</h1>
            <a href="" onClick={ev => {
                device.process_start(DEVICE_PROGRAM_DOWNLOAD);
                ev.preventDefault()
            }}>Download</a>
        </div>
        <div>
            {device.interfaces.map((iface) => (
                <div>
                    <h5>{iface.id()}</h5>
                    {iface instanceof EthernetInterface && <p>MAC address: <span onClick={selectContents}>{iface.macAddress.toString()}</span></p>}
                    {(() => {
                        let source4 = iface.addresses.find(a => a.address instanceof IPV4Address), source6 = iface.addresses.find(a => a.address instanceof IPV6Address);
                        return (<>
                            {source4 && <p>IPv4 address: <span onClick={selectContents}>{source4.address.toString()}</span>/<span>{source4.netmask.length}</span></p>}
                            {source6 && <p>IPv6 address: <span onClick={selectContents}>{source6.address.toString()}</span>/<span>{source6.netmask.length}</span></p>}
                        </>)
                    })()}
                    <p>is connected: {iface.up + ""}</p>
                </div>
            ))}
        </div>
    </div>
}

let sw1 = new NetworkSwitch2();
sw1.name = "SW1";
let iface_sw1_pc1 = sw1.interface_add(new EthernetInterface(sw1));
let iface_sw1_pc2 = sw1.interface_add(new EthernetInterface(sw1));
let iface_sw1_pc3 = sw1.interface_add(new EthernetInterface(sw1));

let pc1 = new Device2();
let pc2 = new Device2();
let pc3 = new Device2();
pc1.name = "PC1"
pc2.name = "PC2"
pc3.name = "PC3"

let iface_pc1 = new EthernetInterface(pc1, createMacAddress()); pc1.interface_add(iface_pc1)
let iface_pc2 = new EthernetInterface(pc2, createMacAddress()); pc2.interface_add(iface_pc2)
let iface_pc3 = new EthernetInterface(pc3, createMacAddress()); pc3.interface_add(iface_pc3)

pc1.interface_set_address(iface_pc1, new IPV4Address("192.168.1.10"), createMask(IPV4Address, 24));
pc2.interface_set_address(iface_pc2, new IPV4Address("192.168.1.20"), createMask(IPV4Address, 24));
pc3.interface_set_address(iface_pc3, new IPV4Address("192.168.1.30"), createMask(IPV4Address, 24));


iface_sw1_pc1.connect(iface_pc1)
iface_sw1_pc2.connect(iface_pc2)
iface_sw1_pc3.connect(iface_pc3)

function screamToEchoUDPServer(pc: Device2) {
    let contact = pc.contact_create("IPv4", "UDP").data!;

    let destination = new IPV4Address("192.168.1.10"); // iface_pc1 ipv4 address

    // THIS IS WHY IT IS IMPORTANT THAT THE DEVICE INTERFACES OUTPUT ARE ASYNCHRONUS
    let r = contact.sendTo(contact, { buffer: uint8_fromNumber(0xdeadf00d, 10) }, { daddr: destination, dport: SERVER_PORT })
    contact.receive(contact, (_, data, caddr) => {
        console.log(new IPV4Address(data.buffer.subarray(0, 4)).toString(), uint8_readUint16BE(data.buffer.subarray(4)), caddr!.sport);
        contact.close(contact)
    })

    if (!r.success) {
        contact.close(contact);
        console.log("failed to send", r.message, pc.name)
    }
}

// UDP server respond with address and port
const SERVER_PORT = 3640; // ECHO
let serverContact = pc1.contact_create("IPv4", "UDP").data!;
if (!serverContact.receiveFrom(serverContact, (contact, _, caddr) => {
    console.info("[UDP_ECHO_SERVER] recieved request ... responding")
    let replyContact = pc1.contact_create(contact.addressFamily, contact.proto).data!;
    let r = replyContact.sendTo(replyContact, {
        buffer: uint8_concat([
            caddr!.daddr.buffer,
            uint8_fromNumber(caddr!.sport, 2)
        ])
    }, caddr);
    replyContact.close(replyContact);
}, { sport: SERVER_PORT }).success) {
    throw "failed to bind"
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
                <DeviceComponent device={sw1} />
                <DeviceComponent device={pc2} />
                <DeviceComponent device={pc3} />
            </div>

            {[pc1, pc2].map((device) => (
                <div>
                    <button onClick={() => {
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

                        let destination = new IPV4Address(ip)

                        if (IPV4Address.validate(ip)) {
                            let contact = device.contact_create("IPv4", "RAW").data!;
                            contact.receive(contact, (_, data) => {
                                let iphdr = IPV4_HEADER.from(data.buffer);
                                if (!uint8_equals(iphdr.get("saddr").buffer, destination.buffer )) return;
                                if (iphdr.get("proto") != PROTOCOLS.ICMP) return;
                                if (iphdr.get("payload")[0] != ICMPV4_TYPES.ECHO_REPLY) return;
                                contact.close(contact);
                                success()
                            })

                            let icmpHdr = ICMP_HEADER.create({
                                type: ICMPV4_TYPES.ECHO_REQUEST,
                                data: echoHdr.getBuffer()
                            });

                            icmpHdr.set("csum", calculateChecksum(icmpHdr.getBuffer()));

                            let ipHdr = createIPV4Header({
                                saddr: new IPV4Address("0.0.0.0"),
                                daddr: new IPV4Address(ip),
                                proto: PROTOCOLS.ICMP,
                                payload: icmpHdr.getBuffer()
                            })

                            contact.send(contact, { buffer: ipHdr.getBuffer() }, ipHdr.get("daddr"));
                        } else if (/* IPV6Address.validate(ip) */ true) {
                            let contact = device.contact_create("IPv6", "RAW").data!;
                            contact.receive(contact, (_, data) => {
                                let iphdr = IPV6_HEADER.from(data.buffer);
                                if (!uint8_equals(iphdr.get("saddr").buffer, destination.buffer )) return;
                                if (iphdr.get("nextHeader") != PROTOCOLS.IPV6_ICMP) return;
                                if (iphdr.get("payload")[0] != ICMPV6_TYPES.ECHO_REPLY) return;
                                contact.close(contact);
                                success()
                            })

                            let destination = new IPV6Address(ip)

                            let icmpHdr = ICMP_HEADER.create({
                                type: ICMPV6_TYPES.ECHO_REQUEST,
                                data: echoHdr.getBuffer()
                            });

                            let route = device.route_resolve(destination);
                            if (!route) return;
                            let source = route.iface.addresses.find(a => a.address.constructor == destination.constructor);
                            if (!source) return;

                            let pseudoHdr = IPV6_PSEUDO_HEADER.create({
                                saddr: source?.address as IPV6Address,
                                daddr: destination,
                                len: icmpHdr.size,
                                proto: PROTOCOLS.IPV6_ICMP,
                            })

                            icmpHdr.set("csum", calculateChecksum(uint8_concat([pseudoHdr.getBuffer(), icmpHdr.getBuffer()])));

                            let ipHdr = IPV6_HEADER.create({
                                saddr: source.address as IPV6Address,
                                daddr: destination,
                                nextHeader: PROTOCOLS.IPV6_ICMP,
                                payload: icmpHdr.getBuffer()
                            })

                            contact.send(contact, { buffer: ipHdr.getBuffer() }, destination, route);
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