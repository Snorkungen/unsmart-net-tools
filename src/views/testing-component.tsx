import { Component, createRoot, createSignal } from "solid-js";
import { AddressMask, createMask } from "../lib/address/mask";
import { IPV4Address } from "../lib/address/ipv4";
import { IPV6Address } from "../lib/address/ipv6";
import { uint8_concat, uint8_equals, uint8_fromNumber, uint8_readUint16BE } from "../lib/binary/uint8-array";
import { ICMPV4_TYPES, ICMPV6_TYPES, ICMP_ECHO_HEADER, ICMP_HEADER } from "../lib/header/icmp";
import { calculateChecksum } from "../lib/binary/checksum";
import { IPV4_HEADER, IPV6_HEADER, IPV6_PSEUDO_HEADER, PROTOCOLS, createIPV4Header } from "../lib/header/ip";
import { Device } from "../lib/device/device";
import { BaseInterface, EthernetInterface, LoopbackInterface, VlanInterface, createMacAddress } from "../lib/device/interface";
import { DEVICE_PROGRAM_DOWNLOAD } from "../lib/device/program/program";
import { DAEMON_ECHO_REPLIER } from "../lib/device/program/echo-replier";
import { NetworkSwitch } from "../lib/device/network-switch";
import { DAEMON_ROUTING } from "../lib/device/program/routing";
import { DAEMON_DHCP_SERVER, DHCPServer_Store } from "../lib/device/program/dhcp-server";
import { DEVICE_PROGRAM_DHCP_CLIENT } from "../lib/device/program/dhcp-client";
import { render } from "solid-js/web";
const selectContents = (ev: MouseEvent) => {
    if (!(ev.currentTarget instanceof HTMLElement)) return;
    let range = document.createRange();
    range.selectNode(ev.currentTarget);
    window.getSelection()?.addRange(range);
}

function handle_ping(device: Device) {
    return () => {
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
                if (!uint8_equals(iphdr.get("saddr").buffer, destination.buffer)) return;
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
                if (!uint8_equals(iphdr.get("saddr").buffer, destination.buffer)) return;
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
    }
}

const DeviceComponent: Component<{ device: Device }> = ({ device }) => {
    // HACKY BS
    device.process_start(DAEMON_ECHO_REPLIER);

    let create_content = () => <div>
        {device.interfaces.map((iface) => (
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

    const [content, setContent] = createSignal(create_content());

    return <div>
        <div style={{ display: "flex", "justify-content": "space-between", "align-items": "end" }}>
            <h2>{device.name}</h2>
            <div style={{ gap: "1em", display: "flex" }}>
                <button onclick={() => setContent(create_content())} >refresh</button>
                <button onclick={handle_ping(device)}>ping</button>

                <a href="" onClick={ev => {
                    device.process_start(DEVICE_PROGRAM_DOWNLOAD);
                    ev.preventDefault()
                }}>Download</a>
            </div>
        </div>
        {content()}
        <hr />
    </div>
}

/* Redo testing component ...
    [ ] - test vlan-switch
    [ ] - test routing ...
    
    [ ] - test UDP & TCP ...
*/

/* switch an router are on the same device ... */
let r1 = new NetworkSwitch(); r1.name = "R1";
r1.process_start(DAEMON_ROUTING);

let r1_iface_vlan10 = r1.interface_add(new VlanInterface(r1, 10));
r1.interface_set_address(r1_iface_vlan10, new IPV4Address("10.10.0.1"), createMask(IPV4Address, 16));
let r1_iface_vlan20 = r1.interface_add(new VlanInterface(r1, 20));
r1.interface_set_address(r1_iface_vlan20, new IPV4Address("10.20.0.1"), createMask(IPV4Address, 16));


function push_default_gateway(device: Device, iface: BaseInterface, gateway: IPV4Address) {

    device.routes.push({
        destination: new IPV4Address("0.0.0.0"),
        netmask: createMask(IPV4Address, 0),
        gateway: gateway,
        f_gateway: true,
        iface,
    })
}

let server_pc = new Device(); server_pc.name = "SRV 10";
let server_iface_lo = server_pc.interface_add(new LoopbackInterface(server_pc)); server_iface_lo.start();
let server_iface_eth = server_pc.interface_add(new EthernetInterface(server_pc));
server_pc.interface_set_address(server_iface_eth, new IPV4Address("10.10.0.100"), createMask(IPV4Address, 24));

/* push default gateway ... */
push_default_gateway(server_pc, server_iface_eth, new IPV4Address("10.10.0.1"));

let pc1 = new Device(); pc1.name = "PC1";
let pc1_iface = pc1.interface_add(new EthernetInterface(pc1));

let pc2 = new Device(); pc2.name = "PC2";
let pc2_iface = pc2.interface_add(new EthernetInterface(pc2));
pc2.interface_set_address(pc2_iface, new IPV4Address("10.20.0.20"), createMask(IPV4Address, 24));
/* push default gateway ... */
push_default_gateway(pc2, pc2_iface, new IPV4Address("10.20.0.1"));


/* connnect ethernet interfaces ... */
let r1_iface_server = r1.interface_add(new EthernetInterface(r1));
r1_iface_server.vlan = { type: "access", "vids": [10] }
let r1_iface_pc1 = r1.interface_add(new EthernetInterface(r1)); r1_iface_pc1.vlan = { type: "access", "vids": [10] }
let r1_iface_pc2 = r1.interface_add(new EthernetInterface(r1)); r1_iface_pc2.vlan = { type: "access", "vids": [20] }

server_iface_eth.connect(r1_iface_server);
pc1_iface.connect(r1_iface_pc1);
pc2_iface.connect(r1_iface_pc2);

pc1.process_start(DAEMON_ECHO_REPLIER);

// SRV start DHCP server ...
// TODO DHCP support gateway ...
let dhcp_server_config: DHCPServer_Store = {
    parameters: [
        {
            ifid: server_iface_eth.id(),
            version : 4,

            address_range: ["10.10.0.200", "10.10.0.240"],
            gateways: ["10.10.0.1"],
        }
    ]
};
server_pc.store.set(DAEMON_DHCP_SERVER.name, dhcp_server_config);

server_pc.process_start(DAEMON_DHCP_SERVER)



export const TestingComponent: Component = () => {

    return (
        <div>
            <header>
                <h2>This is a component where trying things are acceptable.</h2>
            </header>
            <div>
                <DeviceComponent device={r1} />
                <DeviceComponent device={server_pc} />
                <DeviceComponent device={pc1} />
                <DeviceComponent device={pc2} />
            </div>
            <div>
                <button onclick={() => pc1.process_start(DEVICE_PROGRAM_DHCP_CLIENT, ["", pc1_iface.id()])} >init dhcp pc1</button>
            </div>
        </div>
    )
}