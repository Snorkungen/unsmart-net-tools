import { BaseAddress } from "../address/base";
import { IPV4Address } from "../address/ipv4";
import { IPV6Address } from "../address/ipv6";
import { MACAddress } from "../address/mac";
import { createMask } from "../address/mask";
import { Device, DeviceRoute } from "../device/device";
import { BaseInterface, EthernetInterface, LoopbackInterface, VlanInterface } from "../device/interface";
import { NETWORK_SWITCH_PORTS_STORE_KEY, NetworkSwitch, NetworkSwitchPorts } from "../device/network-switch";
import { OSInterface } from "../device/osinterface";
import { DAEMON_ECHO_REPLIER } from "../device/program/echo-replier";
import { HOSTSINFO_STORE_KEY, HostsinfoData } from "../device/program/hostsinfo";
import { DAEMON_ROUTING } from "../device/program/routing";

type SerializeContext = {
    /** an array that then linearly searches the array to find by reference */
    objects: object[];
    // contain information and stuff ....
} | undefined;

type SerializeableDeviceAddress = {
    // <address>.constructor.name
    type: string;
    address: string;
    netmask: number;
}

type SerializeableDeviceRoute = {
    // <address>.constructor.name
    type: string;
    destination: string;
    gateway: string;
    netmask: number;

    f_static?: boolean;
    f_gateway?: boolean;
    f_host?: boolean;

    /** keyof is from `iface.name` */
    iface: string;
}

type SerializeableBaseInterface = {
    // !NOTE: does this need to reference the device that created it ...
    unit: number;
    mtu: number;
    addresses: SerializeableDeviceAddress[];
}

interface SerializeableLoopbackInterface extends SerializeableBaseInterface { }
interface SerializeableOSInterface extends SerializeableBaseInterface { }

interface SerializeableEthernetInterface extends SerializeableBaseInterface {
    // !TODO: how do we get relationships since names are not unique? The most fun way would be to with an other pass fill in thees placeholders ... ...
    target?: [device_idx: number, unit: number];
    mac_address: string;
    vlan: EthernetInterface["vlan"];
}

interface SerializeableVlanInterface extends SerializeableBaseInterface { }

type SerializeableDevice = {
    // <device>.constructor.name
    type: string;
    name: string;
    interfaces: {
        eth: SerializeableEthernetInterface[];
        lo: SerializeableLoopbackInterface[];
        osif: SerializeableOSInterface[];
        vlanif: SerializeableVlanInterface[];
    },
    routes: SerializeableDeviceRoute[];
    interfaces_mcast_subscriptions: {
        [ifid: string]: { type: string; address: string }[]
    };
    store: Record<string, unknown>;
    running_programs: string[];
}


function serialize_DeviceAddress(this: SerializeContext, da: BaseInterface["addresses"][number]): SerializeableDeviceAddress {
    return {
        type: da.address.constructor.name,
        address: da.address.toString(),
        netmask: da.netmask.length,
    }
}

function serialize_BaseInterface(this: SerializeContext, iface: BaseInterface): SerializeableBaseInterface {
    return {
        unit: iface.unit,
        addresses: iface.addresses.map(serialize_DeviceAddress),
        mtu: iface.mtu
    }
}

function serialize_EthernetInterface(this: SerializeContext, iface: BaseInterface): SerializeableEthernetInterface {
    if (!(iface instanceof EthernetInterface)) {
        throw new Error();
    }


    let target: SerializeableEthernetInterface["target"] = undefined;

    if (iface.target && this) {
        let device_idx = this.objects.findIndex((o) => o === iface.target?.device);
        if (device_idx < 0) {
            device_idx = this.objects.push(iface.target.device) - 1;
        }

        target = [device_idx, iface.target.unit];
    }

    return {
        ...serialize_BaseInterface.call(this, iface),
        mac_address: iface.macAddress.toString(),
        vlan: iface.vlan,
        target: target,
    }
}

function serialize_DeviceRoute(this: SerializeContext, route: DeviceRoute): SerializeableDeviceRoute {
    return {
        type: route.destination.constructor.name,
        destination: route.destination.toString(),
        gateway: route.gateway.toString(),
        netmask: route.netmask.length,
        f_gateway: route.f_gateway,
        f_host: route.f_host,
        f_static: route.f_static,

        iface: route.iface.id(),
    }
}

export function serialize_Device(this: SerializeContext, device: Device): SerializeableDevice {
    // !TODO: figure out a better way of serializing the data, because theyre essentially allowed to change and other stuff so they'l break anyhow
    // only support for now the things needed to have fun creating weird routing demos

    const store: Record<string, any> = {};
    const ports = device.store_get<NetworkSwitchPorts>(NETWORK_SWITCH_PORTS_STORE_KEY);
    if (ports) {
        store[NETWORK_SWITCH_PORTS_STORE_KEY] = Object.entries(ports).reduce<{
            [port_no: string]: {
                [x: string]: unknown;
                iface: string;
            }
        }>((res, [port_no, port]) => {
            if (port.type) {
                throw new Error("serializing unknown port types not supported")
            }

            res[port_no] = {
                ...port,
                iface: port.iface.id(),
            }
            return res;
        }, {});
    }

    const hostsinfo = device.store_get<HostsinfoData>(HOSTSINFO_STORE_KEY);
    if (hostsinfo) {
        store[HOSTSINFO_STORE_KEY] = {
            hosts: hostsinfo.hosts,
            addresses: hostsinfo.addresses.map(addresses => addresses.map(a => a.toJSON()))
        }
    }

    const running_programs: string[] = [];
    if (device.processes.items.find((proc) => proc?.id.includes(DAEMON_ECHO_REPLIER.name))) {
        running_programs.push(DAEMON_ECHO_REPLIER.name);
    }

    if (device.processes.items.find((proc) => proc?.id.includes(DAEMON_ROUTING.name))) {
        running_programs.push(DAEMON_ROUTING.name);
    }

    return {
        type: device.constructor.name,
        name: device.name,
        interfaces: {
            eth: device.interfaces.filter(iface => iface instanceof EthernetInterface).map(serialize_EthernetInterface.bind(this)),
            lo: device.interfaces.filter(iface => iface instanceof LoopbackInterface).map(serialize_BaseInterface),
            osif: device.interfaces.filter(iface => iface instanceof OSInterface).map(serialize_BaseInterface),
            vlanif: device.interfaces.filter(iface => iface instanceof VlanInterface).map(serialize_BaseInterface),
        },
        interfaces_mcast_subscriptions: Object.entries(device.interfaces_mcast_subscriptions).reduce<SerializeableDevice["interfaces_mcast_subscriptions"]>((res, [ifid, addresses]) => {
            res[ifid] = addresses.map(a => a.toJSON())
            return res;
        }, {}),
        routes: device.routes.map(serialize_DeviceRoute.bind(this)),
        store: store,
        running_programs: running_programs
    }
}

function deserialize_resolve_address_type(type: string): typeof BaseAddress {
    if (type == MACAddress.name) {
        return MACAddress;
    } else if (type == IPV4Address.name) {
        return IPV4Address;
    } else if (type == IPV6Address.name) {
        return IPV6Address;
    }

    throw new Error();
}

function deserialize_onto_iface(this: SerializeContext, iface: BaseInterface, siface: SerializeableBaseInterface) {
    iface.mtu = siface.mtu;
    iface.unit = siface.unit;

    iface.addresses = siface.addresses.map(v => {
        let constructor = deserialize_resolve_address_type(v.type);
        return {
            address: new constructor(v.address),
            netmask: createMask(constructor, v.netmask),
        }
    })
}

function deserialize_interfaces(this: SerializeContext, device: Device, sdevice: SerializeableDevice) {
    for (let ser_iface of sdevice.interfaces.lo) {
        let iface = device.interface_add(
            new LoopbackInterface(device)
        )
        deserialize_onto_iface.call(this, iface, ser_iface);
    }

    for (let ser_iface of sdevice.interfaces.vlanif) {
        let iface = device.interface_add(
            new VlanInterface(device, ser_iface.unit)
        )
        deserialize_onto_iface.call(this, iface, ser_iface);
    }
    for (let ser_iface of sdevice.interfaces.osif) {
        let iface = device.interface_add(
            new OSInterface(device)
        )
        deserialize_onto_iface.call(this, iface, ser_iface);
        iface.start();
    }
    for (let seth of sdevice.interfaces.eth) {
        let iface = device.interface_add(
            new EthernetInterface(device, new MACAddress(seth.mac_address))
        )

        deserialize_onto_iface.call(this, iface, seth);

        // attempt to resolve and find the target device ...
        if (this && seth.target) {
            let [didx, unit] = seth.target;

            let d = this.objects[didx];
            if (d instanceof Device) {
                let target = d.interfaces.find((v) => v.id() === "eth" + unit)

                if (target instanceof EthernetInterface) {
                    iface.connect(target);
                }
            }

        }
    }

}

export function deserialize_Device(this: SerializeContext, sdevice: SerializeableDevice): Device {
    let device: Device;
    if (sdevice.type === NetworkSwitch.name) {
        device = new NetworkSwitch();
    } else {
        device = new Device();
    }

    device.name = sdevice.name;
    deserialize_interfaces.call(this, device, sdevice);

    device.routes = sdevice.routes.map((v) => {
        let constructor = deserialize_resolve_address_type(v.type);

        let iface = device.interfaces.find((vi) => vi.id() == v.iface)

        if (!iface) {
            throw new Error();
        }

        return {
            iface: iface,
            destination: new constructor(v.destination),
            gateway: new constructor(v.gateway),
            netmask: createMask(constructor, v.netmask),
            f_gateway: v.f_gateway || undefined,
            f_host: v.f_host || undefined,
            f_static: v.f_static || undefined,
        }
    })

    device.interfaces_mcast_subscriptions = {};
    Object.entries(sdevice.interfaces_mcast_subscriptions).forEach(([key, val]) => {
        device.interfaces_mcast_subscriptions[key] = val.map((v) => {
            let constructor = deserialize_resolve_address_type(v.type);
            return new constructor(v.address)
        })
    })

    const sports = sdevice.store[NETWORK_SWITCH_PORTS_STORE_KEY] as {
        [port_no: string]: {
            [x: string]: unknown;
            iface: string;
        }
    };
    if (sports) {
        device.store_set(NETWORK_SWITCH_PORTS_STORE_KEY, Object.entries(sports).reduce<any>((res, [port_no, port]) => {
            let iface = device.interfaces.find(v => v.id() == port.iface);
            if (!iface) {
                throw new Error();
            }
            res[port_no] = {
                ...port,
                iface: iface,
            }
            return res;
        }, {}))
    }

    const shostsinfo = sdevice.store[HOSTSINFO_STORE_KEY] as { hosts: string[]; addresses: ReturnType<BaseAddress["toJSON"]>[] };
    if (shostsinfo) {
        device.store_set(HOSTSINFO_STORE_KEY, {
            hosts: shostsinfo.hosts,
            addresses: shostsinfo.addresses.map(v => {
                let constructor = deserialize_resolve_address_type(v.type);
                return new constructor(v.address);
            })
        })
    }


    if (sdevice.running_programs.includes(DAEMON_ECHO_REPLIER.name)) {
        device.process_start(DAEMON_ECHO_REPLIER);
    }

    if (sdevice.running_programs.includes(DAEMON_ROUTING.name)) {
        device.process_start(DAEMON_ROUTING);
    }

    return device;
}