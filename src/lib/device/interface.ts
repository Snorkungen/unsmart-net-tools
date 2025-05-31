import { createMask, type AddressMask } from "../address/mask";
import { BaseAddress } from "../address/base";
import type { Struct } from "../binary/struct";
import type { Device, DeviceResult, DeviceRoute, NetworkData } from "./device";
import { IPV4Address } from "../address/ipv4";
import { IPV6Address } from "../address/ipv6";
import { MACAddress } from "../address/mac";
import { uint8_fromNumber, uint8_concat, uint8_equals } from "../binary/uint8-array";
import { ETHERNET_HEADER, ETHER_TYPES, ETHERNET_DOT1Q_HEADER } from "../header/ethernet";
import { DeviceResource, DeviceResources } from "./internals/resources";

type DeviceAddress<AT extends typeof BaseAddress = typeof BaseAddress> = {
    address: InstanceType<AT>;
    // broadcast: InstanceType<AT>; // calculate broadcast on the fly
    netmask: AddressMask<AT>
}


type InterfaceName = "eth" | "lo" | "vlanif";
export class BaseInterface {
    /** The device this interface is attached to */
    device: Device;
    name: InterfaceName;
    unit: number;

    addresses: DeviceAddress[];

    /** MAX TRANSMISSION UNIT */
    mtu: number;
    /** if interface is up and ready to send and receive */
    up: boolean;

    /** hw header, a header that the interface uses */
    header: null | Struct<any> = null;
    /** flag that denotes if the interface is virtual, i.e. some construct that the device uses */
    virtual: boolean = true;

    constructor(
        device: Device,
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

    output(data: NetworkData, destination: BaseAddress, rtentry?: DeviceRoute): DeviceResult {
        throw new Error("method not implemented")
    }
    /** Initialize stuff idk but for example dhcp or for loclalhost self assign ip address */
    start(): DeviceResult {
        throw new Error("method not implemented")
    };

    id() {
        return this.name + this.unit
    }

    connect(target: BaseInterface) { }
    disconnect() { }

    resources = new DeviceResources();
}

let macAddressCount = 0;
let startBuf = new Uint8Array([0xfa, 0xff, 0x0f, 0])
export function createMacAddress(): MACAddress {
    let buf = uint8_fromNumber(macAddressCount++, 2)
    return new MACAddress(uint8_concat([startBuf, buf]))
}
export class EthernetInterface extends BaseInterface {
    target: EthernetInterface | undefined;
    macAddress: MACAddress;
    header = ETHERNET_HEADER;
    virtual = false;

    constructor(device: Device, macAddress: MACAddress = createMacAddress()) {
        super(device, "eth",
            device.interfaces.reduce((s, { name }) => s + ((name == "eth") as unknown as number), 0),
            1500
        )
        this.macAddress = macAddress;
    }

    /** this logic might need to be hoisted to {@link Device} */
    vlan?: {
        // first id default
        vids: number[];
        type: "access" | "trunk"
    }
    vlan_set(type: "access" | "trunk", ...vids: number[]) {
        if (vids.length < 1) {
            vids.push(1); // default id;
        }
        this.vlan = { type: type, vids: vids };
    }

    output(data: NetworkData, destination: BaseAddress, rtentry?: DeviceRoute<typeof BaseAddress>): DeviceResult<"UDUMB"> {
        if (!this.up || !this.target) {
            return { success: false, error: "UDUMB", message: "interface is eiter not up or a route entry is missing" };
        }

        let etherheader: typeof ETHERNET_HEADER;
        if (destination instanceof IPV4Address) {
            if (!rtentry) return { success: false, error: "UDUMB", message: "route required" }
            let dmac = this.device.arp_resolve(data, destination, rtentry);
            if (!dmac) {
                // this method will get called recalled at a later times
                return { success: true, data: undefined, message: "the interface is waiting for a LINK_LEVEL destination" };
            }
            etherheader = ETHERNET_HEADER.create({ dmac, ethertype: ETHER_TYPES.IPv4 })
        } else if (destination instanceof IPV6Address) {
            if (!rtentry) return { success: false, error: "UDUMB", message: "route required" }
            let dmac = this.device.arp_resolve(data, destination, rtentry);
            if (!dmac) {
                // this method will get called recalled at a later times
                return { success: true, data: undefined, message: "the interface is waiting for a LINK_LEVEL destination" };
            }
            etherheader = ETHERNET_HEADER.create({ dmac, ethertype: ETHER_TYPES.IPv6 })
        } else {
            if (destination.buffer.length < ETHERNET_HEADER.getMinSize()) {
                // the header is an invalid size
                return { success: true, data: undefined, error: "UDUMB", message: "the ethernet header added is invalid" };
            }
            etherheader = ETHERNET_HEADER.from(destination.buffer);
        }

        if (!data.mode_raw) {
            etherheader.set("smac", this.macAddress);
        }

        etherheader.set("payload", data.buffer);

        if (uint8_equals(etherheader.get("smac").buffer, etherheader.get("dmac").buffer)) {
            // this was meant for myself
            this.resources.create(this.device.schedule(() => {
                let lodata = { buffer: etherheader.getBuffer(), rcvif: this, broadcast: undefined };
                this.device.log(lodata, "RECEIVE"); this.device.input_ether(etherheader, lodata)
            }))
            return { success: true, data: undefined }
        }

        if (false && etherheader.get("dmac").isBroadcast()) {
            // here i should send to the interface to itself but i don't want that
            this.resources.create(this.device.schedule(() => {
                let lodata = { buffer: etherheader.getBuffer(), rcvif: this, broadcast: true };
                this.device.log(lodata, "RECEIVE"); this.device.input_ether(etherheader, lodata)
            }));
        }

        // !TODO: mode to enable user to skip over vlan handling
        vlan_handler: if (this.vlan) {
            if (this.vlan.type === "access") {
                if (etherheader.get("ethertype") != ETHER_TYPES.VLAN) {
                    break vlan_handler; // if untagged pass through
                }

                let vlanhdr = ETHERNET_DOT1Q_HEADER.from(etherheader.get("payload"));
                if (!this.vlan.vids.includes(vlanhdr.get("vid"))) {
                    return {
                        success: false, error: "UDUMB",
                        message: "vlan id: " + vlanhdr.get("vid") + " is not in vlan id list"
                    }
                }

                // untag frame
                etherheader.set("ethertype", vlanhdr.get("ethertype"));
                etherheader.set("payload", vlanhdr.get("payload"));
            } else if (this.vlan.type == "trunk") {
                if (etherheader.get("ethertype") != ETHER_TYPES.VLAN) {
                    return { success: false, error: "UDUMB", message: "frame must have a vlan tag for trunk interface" }
                }

                let vlanhdr = ETHERNET_DOT1Q_HEADER.from(etherheader.get("payload"));
                if (!this.vlan.vids.includes(vlanhdr.get("vid"))) {
                    return {
                        success: false, error: "UDUMB",
                        message: "vlan id: " + vlanhdr.get("vid") + " is not in vlan id list"
                    }
                }
            }
        }

        this.device.event_dispatch("interface_send", this);
        // somehow put on wire
        this.resources.create(this.device.schedule(() => {
            this.device.log({
                buffer: etherheader.getBuffer(),
                rcvif: this
            }, "SEND")
            this.target && this.target.receive.call(this.target, etherheader)
        }, undefined));
        return { success: true, data: undefined }
    }

    receive_delay: number | undefined = undefined;
    private receive(etherheader: typeof ETHERNET_HEADER) {
        vlan_handler: if (this.vlan) {
            if (this.vlan.type == "access") {
                if (etherheader.get("ethertype") != ETHER_TYPES.VLAN) {
                    // tag frame
                    let vid = this.vlan.vids[0] || 0; // default to 0 to insinuate that there is a problem

                    let vlanhdr = ETHERNET_DOT1Q_HEADER.create({
                        vid: vid,
                        ethertype: etherheader.get("ethertype"),
                        payload: etherheader.get("payload")
                    });

                    etherheader.set("ethertype", ETHER_TYPES.VLAN);
                    etherheader.set("payload", vlanhdr.getBuffer());

                    break vlan_handler;
                }

                let vlanhdr = ETHERNET_DOT1Q_HEADER.from(etherheader.get("payload"));
                if (!this.vlan.vids.includes(vlanhdr.get("vid"))) {
                    return; // discard
                }
            } else if (this.vlan.type == "trunk") {
                if (etherheader.get("ethertype") != ETHER_TYPES.VLAN) {
                    return; // discard
                }

                let vlanhdr = ETHERNET_DOT1Q_HEADER.from(etherheader.get("payload"));
                if (!this.vlan.vids.includes(vlanhdr.get("vid"))) {
                    return; // discard
                }
            }
        }


        let data = { rcvif: this, rcvif_hwaddress: this.macAddress, buffer: etherheader.getBuffer(), broadcast: etherheader.get("dmac").isBroadcast() }

        if (this.device.interface_filter(this, data)) {
            return; // Drop Frame
        }

        this.resources.create(this.device.schedule(() => {
            this.device.log(data, "RECEIVE");
            this.device.input_ether(etherheader, data);
        }, this.receive_delay))

        this.device.event_dispatch("interface_recv", this);
    }

    disconnect() {
        if (!this.target) {
            return;
        }

        let disconnect = this.target.disconnect.bind(this.target);
        this.target = undefined;
        this.up = false;
        this.device.arp_invalidate_cache(this);

        this.device.event_dispatch("interface_connect", this);
        disconnect();

        this.resources.close();
    }

    connect(target: EthernetInterface) {
        if (this.constructor != target.constructor) {
            throw new Error("cannot connect with different interface type")
        }
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

        this.device.event_dispatch("interface_connect", this);
    }
}
export class LoopbackInterface extends BaseInterface {
    constructor(device: Device) {
        super(device, "lo",
            device.interfaces.reduce((s, { name }) => s + ((name == "lo") as unknown as number), 0),
            0xfffe
        )

        this.virtual = true;
    }

    output(data: NetworkData, destination: BaseAddress, route?: DeviceRoute): DeviceResult<"UDUMB"> {
        let res = this.device.output_loopback(data, destination, route);
        return { ...res, error: "UDUMB" }
    }

    /** Initialize stuff idk but for example dhcp or for loclalhost self assign ip address */
    start(): DeviceResult<"UDUMB"> {

        this.device.interface_address_set(
            this,
            new IPV4Address("127.0.0.1"),
            createMask(IPV4Address, 8)
        );

        this.device.interface_address_set(
            this,
            new IPV6Address("::1"),
            createMask(IPV6Address, IPV6Address.ADDRESS_LENGTH /* 128 */)
        );

        this.up = true;
        return { success: true, data: undefined };
    };
}
export class VlanInterface extends BaseInterface {
    get vid() { return this.unit };
    constructor(device: Device, vid: number) {
        super(device, "vlanif",
            vid,
            0xfffe,
        )

        this.header = ETHERNET_HEADER;
        this.up = true;
        this.virtual = true;
    }

    private macaddresses = new Map<string, BaseInterface>()
    private log_input = true;

    input(etherframe: typeof ETHERNET_HEADER, data: NetworkData) {
        if (etherframe.get("ethertype") != ETHER_TYPES.VLAN)
            throw new Error("vlanif can't process etherhdr, must have a vlan tag");

        let vlanhdr = ETHERNET_DOT1Q_HEADER.from(etherframe.get("payload"));
        if (vlanhdr.get("vid") != this.vid)
            throw new Error("vlanif incorrect vid passed")

        // untag frame
        etherframe.set("ethertype", vlanhdr.get("ethertype"));
        etherframe.set("payload", vlanhdr.get("payload"));

        if (!data.rcvif || !(data.rcvif_hwaddress instanceof MACAddress)) {
            return; // !TODO: this should mayber throw an error
        }

        // !TODO: maybe pass other vlan information forward to the device
        this.macaddresses.set(etherframe.get("smac").toString(), data.rcvif);

        data = { rcvif: this, rcvif_hwaddress: data.rcvif_hwaddress, buffer: etherframe.getBuffer(), broadcast: data.broadcast }

        if (this.device.interface_filter(this, data)) {
            return; // Drop Frame
        }

        this.resources.create(this.device.schedule(() => {
            if (this.log_input) {
                // this.device.log(data, "RECEIVE")
            }

            this.device.input_ether(etherframe, data)
        }))
    }

    output(data: NetworkData, destination: BaseAddress, rtentry?: DeviceRoute<typeof BaseAddress> | undefined): DeviceResult<"UDUMB"> {
        let etherheader: typeof ETHERNET_HEADER;
        if (destination instanceof IPV4Address) {
            if (!rtentry) return { success: false, error: "UDUMB", message: "route required" }
            let dmac = this.device.arp_resolve(data, destination, rtentry);
            if (!dmac) {
                // this method will get called recalled at a later times
                return { success: true, data: undefined, message: "the interface is waiting for a LINK_LEVEL destination" };
            }
            etherheader = ETHERNET_HEADER.create({ dmac, ethertype: ETHER_TYPES.IPv4 })
        } else if (destination instanceof IPV6Address) {
            if (!rtentry) return { success: false, error: "UDUMB", message: "route required" }
            let dmac = this.device.arp_resolve(data, destination, rtentry);
            if (!dmac) {
                // this method will get called recalled at a later times
                return { success: true, data: undefined, message: "the interface is waiting for a LINK_LEVEL destination" };
            }
            etherheader = ETHERNET_HEADER.create({ dmac, ethertype: ETHER_TYPES.IPv6 })
        } else {
            if (destination.buffer.length < ETHERNET_HEADER.getMinSize()) {
                // the header is an invalid size
                return { success: true, data: undefined, error: "UDUMB", message: "the ethernet header added is invalid" };
            }
            etherheader = ETHERNET_HEADER.from(destination.buffer);
        }

        etherheader.set("payload", data.buffer);

        // #ALWAYSTAGGING
        if (etherheader.get("ethertype") === ETHER_TYPES.VLAN) {
            let vlanhdr = ETHERNET_DOT1Q_HEADER.from(etherheader.get("payload"));
            // !TODO: if i could be bothered support S_VLAN
            if (vlanhdr.get("vid") != this.vid) {
                return { success: false, error: "UDUMB", message: "vlanif can't output an incorrectly tagged frame, vid does not match" }
            }
        } else {
            let vlanhdr = ETHERNET_DOT1Q_HEADER.create({
                vid: this.vid,
                ethertype: etherheader.get("ethertype"),
                payload: etherheader.get("payload")
            });
            etherheader.set("ethertype", ETHER_TYPES.VLAN);
            etherheader.set("payload", vlanhdr.getBuffer());
        }

        data = { rcvif: this, buffer: etherheader.get("payload"), broadcast: data.broadcast };

        let iface = this.macaddresses.get(etherheader.get("dmac").toString());
        if (iface) {
            this.resources.create(this.device.schedule(() => {
                if (!iface) return;
                iface.output(data, new BaseAddress(etherheader.getBuffer()), rtentry)
            }))
            return { success: true, data: undefined };
        }

        let out_interfaces = this.device.interfaces.filter(iface => iface !== this && iface.header === ETHERNET_HEADER && iface);
        if (out_interfaces.length == 0) {
            return { success: false, error: "UDUMB", message: "vlanif no outgoing interface found for frame" }
        }

        this.resources.create(this.device.schedule(() => {
            for (iface of out_interfaces) {
                iface && iface.output(data, new BaseAddress(etherheader.getBuffer()), rtentry);
            }
        }))

        return { success: true, data: undefined }
    }
}