import { Component, JSX } from "solid-js";
import { Device } from "../lib/device/device";
import { Host } from "../lib/device/host";
import { NetworkSwitch } from "../lib/device/network-switch";
import { pingVersion4, pingVersion6 } from "../lib/device/applications/ping";
import { createMask } from "../lib/address/mask";
import { IPV4Address } from "../lib/address/ipv4";
import { IPV6Address } from "../lib/address/ipv6";
import { ContactAddrFamily, ContactProto } from "../lib/device/contact/contact";
import { calculateChecksum } from "../lib/binary/checksum";
import { ICMP_ECHO_HEADER, ICMP_HEADER, ICMPV4_TYPES, ICMPV6_TYPES } from "../lib/header/icmp";
import { createIPV4Header, IPV4_PSEUDO_HEADER, IPV6_HEADER, IPV6_PSEUDO_HEADER, PROTOCOLS } from "../lib/header/ip";
import { Buffer } from "buffer";
import { DCHP_OP, DCHP_PORT_CLIENT, DCHP_PORT_SERVER, DHCP_HEADER, DHCP_MAGIC_COOKIE, DHCP_OPTION } from "../lib/header/dhcp/dhcp";
import { DHCP_MESSGAGE_TYPES, DHCP_TAGS } from "../lib/header/dhcp/tags";
import { UINT8 } from "../lib/binary";
import { bufferFromNumber } from "../lib/binary/buffer-from-number";
import { UDP_HEADER } from "../lib/header/udp";
import { ETHERNET_HEADER, ETHER_TYPES } from "../lib/header/ethernet";
import { MACAddress } from "../lib/address/mac";
import DeviceServiceDHCPServer, { incrementAddress } from "../lib/device/service/dhcp-server";
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

let networkSwitch = new NetworkSwitch();
networkSwitch.name = "SW1"

let swIface_pc1 = networkSwitch.createInterface();
let swIface_pc2 = networkSwitch.createInterface();

let pc1 = new Host();
let pc2 = new Host();
pc1.name = "PC1"
pc2.name = "PC2"

let iface_pc1 = pc1.createInterface();
let iface_pc2 = pc2.createInterface();

iface_pc1.ipv4Address = new IPV4Address("192.168.1.10")
iface_pc1.ipv4SubnetMask = createMask(IPV4Address, 24);
iface_pc1.ipv6Address = new IPV6Address("fe80::c438:600:a1ac:ba00")//createLinkLocalAddressV6();
iface_pc1.prefixLength = 64;

// iface_pc2.ipv4Address = new IPV4Address("192.168.1.20")
// iface_pc2.ipv4SubnetMask = createMask(IPV4Address, 24);
iface_pc2.ipv6Address = new IPV6Address("fe80::c438:600:a1ac:b778")//createLinkLocalAddressV6();
iface_pc2.prefixLength = 64;

swIface_pc1.connect(iface_pc1);
swIface_pc2.connect(iface_pc2);

let dhcpParameterRequestlList = DHCP_OPTION.create({
    tag: DHCP_TAGS.PARAMETER_REQUEST_LIST,
    len: 4,
    data: Buffer.from([
        DHCP_TAGS.SUBNET_MASK,
        DHCP_TAGS.ROUTER,
        DHCP_TAGS.DOMAIN_NAME_SERVER,
        DHCP_TAGS.NETWORK_TIME_PROTOCOL_SERVERS
    ])
})

let dhcpRequestedIP = DHCP_OPTION.create({
    tag: DHCP_TAGS.REQUESTED_IP_ADDRESS,
    len: 4,
    data: Buffer.alloc(4)
})

let dhcpClientIdentifier = DHCP_OPTION.create({
    tag: DHCP_TAGS.CLIENT_IDENTIFIER,
    len: 7,
    data: Buffer.concat([
        new Uint8Array([1]), // Type ARP 0x1 Ethernet
        iface_pc2.macAddress.buffer
    ])
})
let dhcpMessageType = DHCP_OPTION.create({
    tag: DHCP_TAGS.DHCP_MESSAGE_TYPE,
    len: 1,
    data: bufferFromNumber(DHCP_MESSGAGE_TYPES.DHCPDISCOVER, 1)
})


let transactionID = Math.floor(Math.random() * (2 ** 14))
let dhcpBootReq = DHCP_HEADER.create({
    op: DCHP_OP.BOOTREQUEST,
    htype: 1,
    hlen: 6,
    xid: transactionID,
    chaddr: Buffer.concat([
        iface_pc2.macAddress.buffer,
        Buffer.alloc(10) // padding
    ]), // total 16 bytes
    options: Buffer.concat([
        DHCP_MAGIC_COOKIE,
        dhcpMessageType.getBuffer(),
        dhcpClientIdentifier.getBuffer(),
        dhcpRequestedIP.getBuffer(),
        dhcpParameterRequestlList.getBuffer(),
        Buffer.from([255]),
    ])
})

let dhcpUDPHdr = UDP_HEADER.create({
    sport: DCHP_PORT_CLIENT,
    dport: DCHP_PORT_SERVER,
    length: UDP_HEADER.getMinSize() + dhcpBootReq.size,
    payload: dhcpBootReq.getBuffer()
})

let ipHdr = createIPV4Header({
    saddr: new IPV4Address("0.0.0.0"),
    daddr: new IPV4Address("255.255.255.255"),
    proto: PROTOCOLS.UDP,
    payload: dhcpUDPHdr.getBuffer(),
})

let ipPseudoHdr = IPV4_PSEUDO_HEADER.create({
    saddr: ipHdr.get("saddr"),
    daddr: ipHdr.get("daddr"),
    proto: ipHdr.get("proto"),
    len: dhcpUDPHdr.get("length")
})

dhcpUDPHdr.set("length", dhcpUDPHdr.size)
dhcpUDPHdr.set("csum",
    calculateChecksum(ipPseudoHdr.getBuffer())
)
ipHdr.set("payload", dhcpUDPHdr.getBuffer());
ipHdr.set("csum", 0).set("csum", calculateChecksum(ipHdr.getBuffer().subarray(0, 20)));

let ethHdr = ETHERNET_HEADER.create({
    dmac: new MACAddress(Buffer.alloc(6, 0xff)),
    ethertype: ETHER_TYPES.IPv4,
    payload: ipHdr.getBuffer()
})

let dhcpServer = new DeviceServiceDHCPServer(pc1)


dhcpServer.configure({
    ipv4AddressRange: [new IPV4Address("192.168.1.100"), new IPV4Address("192.168.1.200")],
    ipv4SubnetMask: iface_pc1.ipv4SubnetMask,
    iface: iface_pc1
})

pc1.addService(dhcpServer);

export const TestingComponent: Component = () => {

    return (
        <div>
            <header>
                <h2>This is a component where trying things are acceptable.</h2>
            </header>
            <button onClick={() => {
                let contact = pc2.contactsHandler.createContact(ContactAddrFamily.RAW, ContactProto.RAW);
                contact.send(ethHdr.getBuffer())
                contact.close()

            }}>Press me</button>
            <div>
                <DeviceComponent device={pc1} />
                <DeviceComponent device={networkSwitch} />
                <DeviceComponent device={pc2} />
            </div>

            {[pc1, pc2].map((device) => (
                <button onClick={async () => {
                    let ip = prompt("Please enter a destination ip, from: " + device.name)

                    if (!ip) return;

                    if (IPV4Address.validate(ip)) {
                        await pingVersion4(device, new IPV4Address(ip))
                    } else if (/* IPV6Address.validate(ip) */ true) {
                        await pingVersion6(device, new IPV6Address(ip))
                    }

                    console.log("%c ECHO Reply recieved: " + device.name, ['background: green', 'color: white', 'display: block', 'text-align: center', 'font-size: 24px'].join(';'))

                }}>Ping from: {device.name}</button>
            ))}
        </div>
    )
}