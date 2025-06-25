import { MACAddress } from "../address/mac";
import { Device, Program } from "../device/device";
import { BaseInterface, EthernetInterface, LoopbackInterface, VlanInterface } from "../device/interface";
import { storev_Array, storev_BaseAddress, storev_BaseInterface, storev_DeviceAddress, storev_DeviceRoute, storev_discrete, storev_number, storev_Object, storev_string, StoreValue, StoreValueS, StoreValueT } from "../device/internals/store";
import { NETWORK_SWITCH_PORTS_STORE_KEY, NetworkSwitch, NetworkSwitchPorts } from "../device/network-switch";
import { OSInterface } from "../device/osinterface";
import { DEVICE_PROGRAM_DAEMAN } from "../device/program/daeman";
import { DEVICE_PROGRAM_DHCP_CLIENT } from "../device/program/dhcp-client";
import { DEVICE_PROGRAM_DHCP_SERVER_MAN } from "../device/program/dhcp-server-man";
import { DAEMON_ECHO_REPLIER } from "../device/program/echo-replier";
import { DEVICE_PROGRAM_HOSTSINFO, HOSTSINFO_STORE_KEY, HostsinfoData } from "../device/program/hostsinfo";
import { DEVICE_PROGRAM_IFINFO } from "../device/program/ifinfo";
import { DEVICE_PROGRAM_MENU } from "../device/program/menu";
import { DEVICE_PROGRAM_PING } from "../device/program/ping";
import { DEVICE_PROGRAM_ECHO, DEVICE_PROGRAM_HELP, DEVICE_PROGRAM_CLEAR, DEVICE_PROGRAM_DOWNLOAD } from "../device/program/program";
import { DEVICE_PROGRAM_ROUTEINFO } from "../device/program/routeinfo";
import { DAEMON_ROUTING, DEVICE_PROGRAM_ROUTINGMAN } from "../device/program/routing";
import { DEVICE_PROGRAM_TRACEROUTE } from "../device/program/traceroute";
import { DEVICE_PROGRAM_VLANINFO } from "../device/program/vlaninfo";
import { network_map_init_device_shape, network_map_init_state } from "./network-map";

const store_hostsinfo: StoreValue<HostsinfoData> = storev_Object({
    hosts: storev_Array(storev_string),
    addresses: storev_Array(storev_Array(storev_BaseAddress)),
});

const store_ports: StoreValue<NetworkSwitchPorts> = storev_discrete(storev_Object({
    iface: storev_BaseInterface,
    port_no: storev_number,
    // !NOTE: this is an enum so nothing is guaranteed
    state: storev_number,
}));

const device_routes = storev_Array(storev_DeviceRoute);
const device_interfaces_mcast_subscriptions = storev_discrete(storev_Array(storev_BaseAddress));

const all_available_programs: Program[] = [
    DEVICE_PROGRAM_ECHO,
    DEVICE_PROGRAM_IFINFO,
    DEVICE_PROGRAM_ROUTEINFO,
    DEVICE_PROGRAM_VLANINFO,
    DEVICE_PROGRAM_HELP,
    DEVICE_PROGRAM_CLEAR,
    DEVICE_PROGRAM_PING,
    DEVICE_PROGRAM_DOWNLOAD,
    DEVICE_PROGRAM_TRACEROUTE,
    DEVICE_PROGRAM_HOSTSINFO,
    DEVICE_PROGRAM_ROUTINGMAN,
    DEVICE_PROGRAM_DAEMAN,
    DEVICE_PROGRAM_DHCP_CLIENT,
    DEVICE_PROGRAM_DHCP_SERVER_MAN,
    DEVICE_PROGRAM_MENU
]

type SerializeContext = {
    /** an array that then linearly searches the array to find by reference */
    objects: object[];
    // contain information and stuff ....
} | undefined;

type SerializeableBaseInterface = {
    unit: number;
    mtu: number;
    addresses: StoreValueS<typeof storev_DeviceAddress>[];
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
    routes: StoreValueS<typeof device_routes>;
    interfaces_mcast_subscriptions: StoreValueS<typeof device_interfaces_mcast_subscriptions>
    store: Record<string, unknown>;
    running_programs: string[];
    programs: string[];
}

function serialize_BaseInterface(this: SerializeContext, iface: BaseInterface): SerializeableBaseInterface {
    return {
        unit: iface.unit,
        addresses: iface.addresses.map(da => storev_DeviceAddress.serialize(da)),
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

function serialize_Device(this: SerializeContext, device: Device): SerializeableDevice {
    // !TODO: figure out a better way of serializing the data, because theyre essentially allowed to change and other stuff so they'l break anyhow
    // only support for now the things needed to have fun creating weird routing demos

    const store: Record<string, any> = {};
    const ports = device.store_get(NETWORK_SWITCH_PORTS_STORE_KEY);
    if (ports && store_ports.validate(ports)) {
        store[NETWORK_SWITCH_PORTS_STORE_KEY] = store_ports.serialize(ports, device);
    }

    const hostsinfo = device.store_get(HOSTSINFO_STORE_KEY);
    if (hostsinfo && store_hostsinfo.validate(hostsinfo)) {
        store[HOSTSINFO_STORE_KEY] = store_hostsinfo.serialize(hostsinfo, device);
    }

    const running_programs: string[] = [];
    if (device.processes.items.find((proc) => proc?.id.includes(DAEMON_ECHO_REPLIER.name))) {
        running_programs.push(DAEMON_ECHO_REPLIER.name);
    }

    if (device.processes.items.find((proc) => proc?.id.includes(DAEMON_ROUTING.name))) {
        running_programs.push(DAEMON_ROUTING.name);
    }

    const programs = device.programs.map(({ name }) => name)

    return {
        type: device.constructor.name,
        name: device.name,
        interfaces: {
            eth: device.interfaces.filter(iface => iface instanceof EthernetInterface).map(serialize_EthernetInterface.bind(this)),
            lo: device.interfaces.filter(iface => iface instanceof LoopbackInterface).map(serialize_BaseInterface),
            osif: device.interfaces.filter(iface => iface instanceof OSInterface).map(serialize_BaseInterface),
            vlanif: device.interfaces.filter(iface => iface instanceof VlanInterface).map(serialize_BaseInterface),
        },
        interfaces_mcast_subscriptions: device_interfaces_mcast_subscriptions.serialize(device.interfaces_mcast_subscriptions, device),
        routes: device_routes.serialize(device.routes, device),
        store: store,
        running_programs: running_programs,
        programs: programs,
    }
}

function deserialize_onto_iface(this: SerializeContext, iface: BaseInterface, siface: SerializeableBaseInterface) {
    iface.mtu = siface.mtu;
    iface.unit = siface.unit;

    iface.addresses = siface.addresses.map(v => storev_DeviceAddress.deserialize(v))
}

function deserialize_interfaces(this: SerializeContext, device: Device, sdevice: SerializeableDevice) {
    for (let seth of sdevice.interfaces.eth) {
        let iface = device.interface_add(
            new EthernetInterface(device, new MACAddress(seth.mac_address))
        )

        deserialize_onto_iface.call(this, iface, seth);

        iface.macAddress = new MACAddress(seth.mac_address);
        iface.vlan = seth.vlan;

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
}

function deserialize_Device(this: SerializeContext, sdevice: SerializeableDevice): Device {
    let device: Device;
    if (sdevice.type === NetworkSwitch.name) {
        device = new NetworkSwitch();
    } else {
        device = new Device();
    }

    device.name = sdevice.name;
    deserialize_interfaces.call(this, device, sdevice);

    device.routes = device_routes.deserialize(sdevice.routes, device);

    device.interfaces_mcast_subscriptions = device_interfaces_mcast_subscriptions.deserialize(sdevice.interfaces_mcast_subscriptions, device);
    
    const sports = sdevice.store[NETWORK_SWITCH_PORTS_STORE_KEY] as undefined | StoreValueS<typeof store_ports>
    if (sports) {
        device.store_set(NETWORK_SWITCH_PORTS_STORE_KEY, store_ports.deserialize(sports, device))
    }

    const shostsinfo = sdevice.store[HOSTSINFO_STORE_KEY] as undefined | StoreValueS<typeof store_hostsinfo>;
    if (shostsinfo) {
        device.store_set(HOSTSINFO_STORE_KEY, store_hostsinfo.deserialize(shostsinfo, device))
    }

    device.programs = sdevice.programs.map(name => all_available_programs.find(p => p.name === name)!)

    if (sdevice.running_programs.includes(DAEMON_ECHO_REPLIER.name)) {
        device.process_start(DAEMON_ECHO_REPLIER);
    }

    if (sdevice.running_programs.includes(DAEMON_ROUTING.name)) {
        device.process_start(DAEMON_ROUTING);
    }

    return device;
}

export function serialize_NetworkMap(state: ReturnType<typeof network_map_init_state>) {
    const context: SerializeContext = {
        objects: []
    }

    const devices: SerializeableDevice[] = [];
    const device_metadata: { position: typeof state["shapes"][number]["position"]; static?: boolean }[] = [];

    for (let shape of state.shapes) {
        if (shape.type != "shape" || !(shape.assob instanceof Device)) {
            continue;
        }

        // find device in context or push
        let s_device = serialize_Device.call(context, shape.assob!);
        let mdata: typeof device_metadata[number] = {
            position: shape.position,
            static: shape.static,
        }

        let idx = context.objects.findIndex(v => v === shape.assob);
        if (idx < 0) {
            idx = context.objects.push(shape.assob) - 1;
        }

        devices[idx] = s_device;
        device_metadata[idx] = mdata;
    }

    return {
        scale: state.scale,
        origin: state.origin,
        devices: devices,
        device_metadata: device_metadata,
    };
}

const switch_dimensions = { width: 85, height: 25 }
export function deserialize_NetworkMap(container: SVGSVGElement, s_state: ReturnType<typeof serialize_NetworkMap>): ReturnType<typeof network_map_init_state> {
    let state = network_map_init_state(container);

    // what should this thing do ...
    // create devices and shapes and then the program can do whatever it feels like

    const context: SerializeContext = {
        objects: []
    }

    for (let i = 0; i < s_state.devices.length; i++) {
        let device = deserialize_Device.call(context, s_state.devices[i]);
        let md = s_state.device_metadata[i];
        context.objects[i] = device;

        let dimensions: typeof switch_dimensions | undefined = undefined;
        if (device instanceof NetworkSwitch) {
            dimensions = switch_dimensions;
        }
        // create and add shape and do stuff ...
        let shape = network_map_init_device_shape(state, device, md.position.x, md.position.y, dimensions)
        shape.static = md.static;
    }

    state.scale = s_state.scale;
    state.origin = s_state.origin;

    return state;
}