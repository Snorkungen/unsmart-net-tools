import { BaseAddress } from "../address/base";
import { IPV4Address } from "../address/ipv4";
import { IPV6Address } from "../address/ipv6";
import { MACAddress } from "../address/mac";
import { AddressMask, createMask } from "../address/mask";
import { and } from "../binary";
import { uint8_fromNumber, uint8_concat, uint8_equals } from "../binary/uint8-array";
import { ETHERNET_HEADER, ETHER_TYPES, EtherType } from "../header/ethernet";
import { IPV4_HEADER, IPV6_HEADER, PROTOCOLS, createIPV4Header } from "../header/ip";
import { ARP_HEADER, ARP_OPCODES, createARPHeader } from "../header/arp";
import { PacketCaptureHFormat, PacketCaptureNFormat, PacketCaptureRecordReader } from "../packet-capture/reader";

let macAddressCount = 0;
let startBuf = new Uint8Array([0xfa, 0xff, 0x0f, 0])
function createMacAddress(): MACAddress {
    let buf = uint8_fromNumber(macAddressCount++, 2)
    return new MACAddress(uint8_concat([startBuf, buf]))
}

export type NeighborEntry<AddressT extends BaseAddress = BaseAddress> = {
    neighbor: AddressT;
    iface: BaseInterface;
    macAddress: MACAddress;
    createdAt: number;
};

export class Device2 {
    name = Math.floor(Math.random() * 10_000).toString() + "B2";
    interfaces: BaseInterface[] = [];
    routes: DeviceRoute[] = [];

    /** this approach is different in such a way that it allows to select for a specific interfac if that something i would like to do */
    private log_records: { time: number, buffer: Uint8Array, iface: BaseInterface }[] = []
    /** This thing is only to be called by interfaces that know the magic sauce  */
    log(data: NetworkData, type: "SEND" | "RECIEVE", record = true) {
        // data.buffer is a complete ethernet frame

        let iface = data.rcvif;
        if (!iface) {
            console.warn("rcif missing")
            return;
        }

        let reader = new PacketCaptureRecordReader({
            "Hformat": PacketCaptureHFormat.unknown,
            "Nformat": PacketCaptureNFormat.unknown,
            bigEndian: true,
        })

        let frame_info = reader.readEthernet(data.buffer, data.buffer.length)

        let iface_name = iface.name + iface.unit;

        if (type == "RECIEVE") {
            console.info(`${this.name} - ${iface_name}: recieved a frame from ${frame_info.saddr}`)
        } else if (type == "SEND") {
            console.info(`${this.name} - ${iface_name}: sent a frame to ${frame_info.daddr}`)
        }

        if (!record) {
            return;
        }

        this.log_records.push({
            time: Date.now(),
            buffer: data.buffer,
            iface
        })

        // throw new Error("Logging complicated so not currently implemented")

    }

    log_select_records(iface_id?: string): Device2["log_records"] {
        if (!iface_id) {
            return this.log_records
        }
        return this.log_records.filter((record) => record.iface.name + record.iface.unit == iface_id)
    }

    input_ipv4(iphdr: typeof IPV4_HEADER, rcvif: BaseInterface) {

        console.log(iphdr.getBuffer())

        // then do some checking if this message is for this device
    }
    input_ipv6(iphdr: typeof IPV6_HEADER, rcvif: BaseInterface) {
        throw new Error("not implemented")
    }

    input_arp(etherheader: typeof ETHERNET_HEADER, rcvif: BaseInterface) {
        let arpHdr = ARP_HEADER.from(etherheader.get("payload"));

        if (arpHdr.get("oper") == ARP_OPCODES.REPLY) {
            // add entry to neigbor map
            let arpHdr = ARP_HEADER.from(etherheader.get("payload"));

            if (arpHdr.get("ptype") != ETHER_TYPES.IPv4) {
                return
            }

            this.arp_cache.set(arpHdr.get("tpa").toString(), {
                neighbor: arpHdr.get("spa"),
                iface: rcvif,
                macAddress: etherheader.get("smac"),
                createdAt: Date.now()
            });

            // this could be a function call

            let items = this.arp_sendque.get((arpHdr.get("tpa").toString()));
            this.arp_sendque.delete(arpHdr.get("tpa").toString())
            if (!items) {
                return
            }
            for (let item of items) {
                if (!item || !item[2]) continue;
                item[2].iface.output(...item)
            }
        } else if (arpHdr.get("oper") == ARP_OPCODES.REQUEST) {
            // sanity check 
            if (!(rcvif instanceof EthernetInterface)) {
                return
            }

            let tpa = arpHdr.get("tpa");

            // naive approach in actuality i should check all interfaces but then again tha might caus unforseen challenging

            let address = rcvif.addresses.find(({ address }) => uint8_equals(address.buffer, tpa.buffer));

            if (!address) {
                return
            }

            let replyARPHdr = arpHdr.create({
                oper: ARP_OPCODES.REPLY,
                tha: rcvif.macAddress
            }), replyEthHdr = ETHERNET_HEADER.create({
                dmac: arpHdr.get("sha"),
                smac: rcvif.macAddress,
                ethertype: ETHER_TYPES.ARP
            })

            rcvif.output({
                type: "DATA",
                buffer: replyARPHdr.getBuffer()
            }, new BaseAddress(replyEthHdr.getBuffer()),
                {} as DeviceRoute // this is hacky but should work
            )
        }
    }

    input_ether(etherframe: typeof ETHERNET_HEADER, rcvif: BaseInterface) {
        if (etherframe.get("ethertype") == ETHER_TYPES.IPv4) {
            this.input_ipv4(
                IPV4_HEADER.from(etherframe.get("payload")),
                rcvif
            )
        } else if (etherframe.get("ethertype") == ETHER_TYPES.IPv6) {
            this.input_ipv6(
                IPV6_HEADER.from(etherframe.get("payload")),
                rcvif
            )
        } else if (etherframe.get("ethertype") == ETHER_TYPES.ARP) {
            this.input_arp(etherframe, rcvif)
        } else if (etherframe.get("ethertype") == ETHER_TYPES.VLAN) {
            throw new Error("not implemented")
        }

        // this knows that the data is an ethernet frame

        // this should do something or mayber there something listening to all traffic that would be interested in this
    }

    arp_sendque = new Map<string, (Parameters<BaseInterface["output"]> | null)[]>();
    arp_cache = new Map<string, NeighborEntry<IPV4Address>>();
    arp_resolve(data: NetworkData, destination: BaseAddress, rtentry: DeviceRoute): MACAddress | null {
        if (data.broadcast) {
            // destination is meant to be broad casted
            return new MACAddress("ff:ff:ff:ff:ff:ff")
        }

        // if destination is not directly connected to source network
        if (rtentry.f_gateway) {
            destination = rtentry.gateway
        }

        let entry = this.arp_cache.get(destination.toString());
        if (entry) {
            return entry.macAddress;
        }

        rtentry.f_gateway = undefined; // this is hacky but logically it should be reasonable

        if (destination instanceof IPV4Address) {
            this.arp_enque(data, destination, rtentry);
            // send away arp request
            for (let iface of this.interfaces) {
                if (!(iface instanceof EthernetInterface)) {
                    continue
                }

                let spa = iface.addresses.find(({ address }) => address instanceof IPV4Address)?.address;
                if (!spa) {
                    spa = new IPV4Address("0.0.0.0")
                }

                let arpHeader = createARPHeader({
                    oper: ARP_OPCODES.REQUEST,
                    sha: iface.macAddress,
                    spa: spa,
                    tpa: destination
                })

                // wrap packet in ethernet frame
                iface.output({
                    type: "DATA",
                    buffer: arpHeader.getBuffer(),
                    broadcast: true
                }, new BaseAddress(ETHERNET_HEADER.create({
                    dmac: new MACAddress("ff:ff:ff:ff:ff:ff"),
                    smac: iface.macAddress,
                    ethertype: ETHER_TYPES.ARP,
                }).getBuffer()), {} as DeviceRoute)
            }
        }

        return null;
    }
    arp_enque(...[data, destination, rtentry]: Parameters<BaseInterface["output"]>) {
        let items = this.arp_sendque.get(destination.toString())
        if (!items) {
            items = [];
        }
        items.push([data, destination, rtentry]);
        this.arp_sendque.set(destination.toString(), items);
    }
}

type DeviceRoute<AddrType extends typeof BaseAddress = typeof BaseAddress> = {
    destination: InstanceType<AddrType>;
    netmask: AddressMask<AddrType>;
    gateway: InstanceType<AddrType>;

    f_dynamic?: true;
    f_gateway?: true;
    f_host?: true;


    iface: BaseInterface;
}

interface NetworkData {
    type: "DATA" | "HEADER";
    buffer: Uint8Array;

    rcvif?: BaseInterface;
    broadcast?: boolean;
}

type DeviceAddress<AT extends typeof BaseAddress = typeof BaseAddress> = {
    address: InstanceType<AT>;
    // broadcast: InstanceType<AT>; // calculate broadcast on the fly
    netmask: AddressMask<AT>
}

type InterfaceName = "eth" | "lo"
class BaseInterface {
    /** The device this interface is attached to */
    device: Device2;
    name: InterfaceName;
    unit: number;

    addresses: DeviceAddress[];

    /** MAX TRANSMISSION UNIT */
    mtu: number;
    /** if interface is up and ready to send and recieve */
    up: boolean;


    constructor(
        device: Device2,
        name: InterfaceName,
        unit: number,
        mtu: number = 256
    ) {
        this.device = device;
        this.name = name;
        this.unit = unit;

        this.addresses = [];
        this.mtu = mtu;
        this.up = false;
    }

    output(data: NetworkData, destination: BaseAddress, rtentry?: DeviceRoute): boolean {
        throw new Error("method not implemented")
    }
    /** Initialize stuff idk but for example dhcp or for loclalhost self assign ip address */
    start(): boolean {
        throw new Error("method not implemented")
    };
}

export class EthernetInterface extends BaseInterface {
    private target: EthernetInterface | undefined;
    macAddress: MACAddress

    constructor(device: Device2, macAddress: MACAddress) {
        super(device, "eth",
            device.interfaces.reduce((s, { name }) => s + ((name == "eth") as unknown as number), 0),
            1500
        )
        this.macAddress = macAddress;
    }

    output(data: NetworkData, destination: BaseAddress, rtentry?: DeviceRoute<typeof BaseAddress>): boolean {
        if (!this.up || !rtentry || !this.target) {
            return false;
        }

        let etherheader: typeof ETHERNET_HEADER;
        if (destination instanceof IPV4Address) {
            let dmac = this.device.arp_resolve(data, destination, rtentry);
            if (!dmac) {
                // this method will get called recalled at a later times
                return true;
            }
            etherheader = ETHERNET_HEADER.create({ dmac, ethertype: ETHER_TYPES.IPv4 })
        } else if (destination instanceof IPV6Address) {
            let dmac = this.device.arp_resolve(data, destination, rtentry);
            if (!dmac) {
                // this method will get called recalled at a later times
                return true;
            }
            etherheader = ETHERNET_HEADER.create({ dmac, ethertype: ETHER_TYPES.IPv6 })
        } else {
            if (destination.buffer.length < ETHERNET_HEADER.getMinSize()) {
                // the header is an invalid size
                return false;
            }
            etherheader = ETHERNET_HEADER.from(destination.buffer);
        }

        etherheader.set("smac", this.macAddress);
        etherheader.set("payload", data.buffer);

        this.device.log({
            type: "DATA",
            buffer: etherheader.getBuffer(),
            rcvif: this
        }, "SEND")

        if (uint8_equals(etherheader.get("smac").buffer, etherheader.get("dmac").buffer)) {
            // this was meant for myself
            window.setTimeout(() => this.recieve(etherheader), 0)
            return true
        }

        if (etherheader.get("dmac").isBroadcast()) {
            // here i should send to the interface itself but i don't want that
            // window.setTimeout(() => this.recieve(etherheader), 0)
        }

        // somehow put on wire
        window.setTimeout(() => this.target && this.target.recieve.bind(this.target)(etherheader), 0)
        return true
    }

    private recieve(etherheader: typeof ETHERNET_HEADER): boolean {
        this.device.log({
            type: "DATA",
            buffer: etherheader.getBuffer(),
            rcvif: this
        }, "RECIEVE")

        this.device.input_ether(etherheader, this);

        return true;
    }

    onDisconnect?: (iface: EthernetInterface) => void;
    disconnect(): boolean {
        if (!this.target) {
            return true;
        }

        let disconnect = this.target.disconnect.bind(this.target);
        this.target = undefined;

        this.onDisconnect && this.onDisconnect(this);

        this.up = false;
        return disconnect();
    }

    onConnect?: (iface: EthernetInterface) => void;
    connect(target: EthernetInterface) {
        if (this == target) {
            throw new Error("cannot connect to self")
        }

        if (this.target == target) {
            return true;
        }

        this.disconnect();
        this.target = target;

        this.up = true;
        target.connect(this)
        this.onConnect && this.onConnect(this);
    }
}
export class LoopbackInterface extends BaseInterface {
    constructor(device: Device2) {
        super(device, "lo",
            device.interfaces.reduce((s, { name }) => s + ((name == "lo") as unknown as number), 0),
            0xfffe
        )
    }

    output(data: NetworkData, destination: BaseAddress): boolean {
        // based on address determine if ipv4 or ipv6
        data.rcvif = this;

        let ethertype: EtherType;


        if (destination instanceof IPV4Address) {
            ethertype = ETHER_TYPES.IPv4;
        } else if (destination instanceof IPV6Address) {
            ethertype = ETHER_TYPES.IPv6;
        } else {
            // unrecognised address type
            return false;
        }

        let log_data: NetworkData = {
            type: "DATA",
            buffer: ETHERNET_HEADER.create({
                ethertype: ethertype,
                payload: data.buffer

            }).getBuffer(),
            rcvif: this
        }

        this.device.log(log_data, "SEND", false)
        this.device.log(log_data, "RECIEVE", true) // Duplicate recording is probably superflous

        window.setTimeout(() => {
            if (ethertype == ETHER_TYPES.IPv4) {
                this.device.input_ipv4(IPV4_HEADER.from(data.buffer), this)
            } else if (ethertype == ETHER_TYPES.IPv6) {
                this.device.input_ipv6(IPV6_HEADER.from(data.buffer), this)
            }
        }, 0)

        return true;
    }
    /** Initialize stuff idk but for example dhcp or for loclalhost self assign ip address */
    start(): boolean {

        let ipv4Address = {
            address: new IPV4Address("127.0.0.1"),
            netmask: createMask(IPV4Address, 8)
        }, ipv6Address = {
            address: new IPV6Address("::1"),
            netmask: createMask(IPV6Address, IPV6Address.ADDRESS_LENGTH) // I do not know how ipv6 routing works
        }

        this.addresses = [
            ipv4Address,
            ipv6Address
        ]

        // add this to routes list
        // this should actually be handled by some other logic


        this.device.routes.push({
            destination: new IPV4Address(and(ipv4Address.address.buffer, ipv4Address.netmask.buffer)),
            netmask: ipv4Address.netmask,
            gateway: ipv4Address.address,
            iface: this,
        })

        this.up = true;
        return true;
    };
}