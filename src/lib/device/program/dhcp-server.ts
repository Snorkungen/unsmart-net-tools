import { IPV4Address } from "../../address/ipv4";
import { MACAddress } from "../../address/mac";
import { AddressMask, createMask } from "../../address/mask";
import { and, mutateNot, mutateAnd, mutateOr } from "../../binary";
import { calculateChecksum } from "../../binary/checksum";
import { uint8_concat, uint8_equals, uint8_fromNumber, uint8_readUint32BE } from "../../binary/uint8-array";
import { DHCP_OP, DHCP_PORT_CLIENT, DHCP_PORT_SERVER, DHCP_END_OPTION, DHCP_HEADER, DHCP_MAGIC_COOKIE, DHCP_OPTION } from "../../header/dhcp/dhcp";
import { parseDHCPOptions } from "../../header/dhcp/parse-options";
import { DHCP_MESSGAGE_TYPES, DHCP_TAGS } from "../../header/dhcp/tags";
import { createDHCPOptionsMap } from "../../header/dhcp/utils";
import { ETHERNET_HEADER } from "../../header/ethernet";
import { IPV4_HEADER, IPV4_PSEUDO_HEADER, PROTOCOLS } from "../../header/ip";
import { UDP_HEADER } from "../../header/udp";
import { Program, ProcessSignal, Process, Contact, NetworkData, Device, address_is_unset, DeviceResult, _UNSET_ADDRESS_IPV4 } from "../device";
import { BaseInterface } from "../interface";

const BROADCAST_IPV4_ADDRESS = new IPV4Address("255.255.255.255");

export function incrementAddress(address: IPV4Address, subnetMask: AddressMask<typeof IPV4Address>) {
    let diff = IPV4Address.ADDRESS_LENGTH - subnetMask.length;
    let size = Math.ceil(diff / 8)
    let bitMask = new Uint8Array(size);

    let firstByteBitOffset = diff % 8;
    if (firstByteBitOffset > 0) {
        bitMask[0] = (2 ** firstByteBitOffset) - 1 << 8 - firstByteBitOffset;
    }

    let prevBuf = new Uint8Array(address.buffer.subarray(4 - size))

    // Next two lines takes dynamic sized buffer len <= 4 and sums into a number    
    let n = 0, i = prevBuf.byteLength, j = i - 1;
    while (i > 0) n += prevBuf[--i] << ((j - i) * 8) // big endian

    let buf = uint8_fromNumber(n + 1, prevBuf.length)

    let leftBitMask = and(bitMask, prevBuf);
    mutateNot(bitMask);
    mutateAnd(buf, bitMask);
    mutateOr(buf, leftBitMask)

    address.buffer.set(buf, 4 - buf.length)
}

const RENEWAL_TIME_IN_SECS = 60 * 15; // 15 mins
const REBINDING_TIME_IN_SECS = 60 * 25; // 25 mins
const IPLEASE_TIME_IN_SECS = 60 * 20; // 20 mins

export enum DHCPServerClientState {
    BINDING,
    BOUND,
    EXPIRED
}
export type DHCPServerClient = {
    state: DHCPServerClientState;
    address4?: IPV4Address;
    gateways4?: IPV4Address[];
    netmask4?: AddressMask<typeof IPV4Address>;

    transaction_id: number;

    /** Unused legacy thing, because the time is not even kept track of */
    lease_time: number;
}
export type DHCPServerConfig = {
    server_id4: IPV4Address;
    netmask4: AddressMask<typeof IPV4Address>;
    clients: Record<string, DHCPServerClient | undefined>;

    gateways4?: IPV4Address[];
    address_range4?: [start: IPV4Address, end: IPV4Address];
}
export type DHCPServer_Store = {
    configs: Record<string, DHCPServerConfig | undefined>;
    probes_enabled?: boolean,
};

export function dhcp_server_serialize_clid(buffer: Uint8Array): string {
    // reference <https://www.rfc-editor.org/rfc/rfc2132#section-9.14>

    let type = buffer[0];
    if (type != 0 && buffer.byteLength == 7) { // !NOTE: if assumptions change then this will throw
        return new MACAddress(buffer.slice(1)).toString();
    }

    console.warn("as to what the client id should be is undetermined")
    return buffer.subarray(1).reduce((res, v) => res + v.toString(16), "");
}
function get_store_data(device: Device): DHCPServer_Store {
    let data: DHCPServer_Store | null = device.store_get(DAEMON_DHCP_SERVER_STORE_KEY);
    if (!data) {
        data = {
            configs: {
            },
        };
        device.store_set(DAEMON_DHCP_SERVER_STORE_KEY, data);
    }

    return data;
}

export { get_store_data as dhcp_server_get_store_data };

/** This is not good, this function makes alot of assumptions */
function send_dhcp4(proc: Process<typeof DAEMON_DHCP_SERVER>, contact: Contact<"IPv4", "RAW">, dhcphdr: typeof DHCP_HEADER, data: NetworkData) {
    if (!data.rcvif) return;
    let source = data.rcvif.addresses.find(a => a.address instanceof IPV4Address);
    if (!source) return;

    let saddr = source.address;
    let daddr = BROADCAST_IPV4_ADDRESS;
    let broadcast = true;

    // divine some weird information out of nowhere
    if (address_is_unset(dhcphdr.get("siaddr"))) {
        dhcphdr.set("siaddr", source.address);
    }

    if (!address_is_unset(dhcphdr.get("ciaddr"))) {
        daddr = dhcphdr.get("ciaddr");
        broadcast = false;
    }

    let udphdr = UDP_HEADER.create({
        dport: DHCP_PORT_CLIENT,
        sport: DHCP_PORT_SERVER,
        payload: dhcphdr.getBuffer(),
    });
    udphdr.set("length", udphdr.size)

    let pseudohdr = IPV4_PSEUDO_HEADER.create({
        saddr, daddr, proto: PROTOCOLS.UDP, len: udphdr.size,
    });
    udphdr.set("csum", calculateChecksum(uint8_concat([pseudohdr.getBuffer(), udphdr.getBuffer()])));

    let iphdr = IPV4_HEADER.create({
        daddr, saddr,
        payload: udphdr.getBuffer(),
        proto: PROTOCOLS.UDP
    });

    let res = contact.send({
        buffer: iphdr.getBuffer(),
        broadcast: broadcast,
    }, daddr, {
        destination: daddr,
        gateway: _UNSET_ADDRESS_IPV4,
        netmask: createMask(IPV4Address, 0),
        iface: data.rcvif
    });

    if (!res.success) {
        console.warn("send_dhcp4", "failed")
    }
}

function createIPv4Address(config: DHCPServerConfig, probes_enabled: boolean = false): IPV4Address | undefined {
    if (!config.address_range4 || !config.netmask4) return undefined;
    // !TODO: does the config setting function check that the range start makes sense
    let [start, end] = config.address_range4;
    let address = new IPV4Address(start);

    let addresses_left = uint8_readUint32BE(end.buffer) - uint8_readUint32BE(address.buffer);
    outer_loop: while ((addresses_left--) > 0) {
        // check the other exsting clients
        for (let client of Object.values(config.clients)) {
            if (!client || !client.address4) continue;

            if (uint8_equals(address.buffer, client.address4.buffer)) {
                incrementAddress(address, config.netmask4);
                continue outer_loop;
            }
        }

        break;
    }

    if (addresses_left <= 0) {
        // !NOTE: the configured address range has been exhausted
        console.warn("the configured address range has been exhausted: " + `[${start}, ${end}]`);
        return undefined;
    }

    if (probes_enabled) {
        throw new Error("probing an address not suported")
    }

    return address;
}

function handle_discover(proc: Process<typeof DAEMON_DHCP_SERVER>, contact: Contact<"IPv4", "RAW">, data: NetworkData, dhcphdr: typeof DHCP_HEADER, opts: ReturnType<typeof createDHCPOptionsMap>) {
    let clid = dhcp_server_serialize_clid(opts.get(DHCP_TAGS.CLIENT_IDENTIFIER) || dhcphdr.get("chaddr"));
    let store_data = get_store_data(proc.device);
    let config = store_data.configs[data.rcvif!.id()]!;
    if (!config.netmask4) {
        return; // this is not configured correctly
    }

    let client: DHCPServerClient = config.clients[clid] || {
        state: DHCPServerClientState.BINDING,
        lease_time: IPLEASE_TIME_IN_SECS,
        transaction_id: 0, // !NOTE: set below
    };

    if (!address_is_unset(dhcphdr.get("ciaddr"))) {
        // this is because I want to hack something togheter
        client.address4 = dhcphdr.get("ciaddr");
    }

    // initialize client
    client.address4 = client.address4 ?? createIPv4Address(config, store_data.probes_enabled);
    if (!client.address4) {
        return; // there was no address give to the following client
    }

    client.state = DHCPServerClientState.BINDING;
    client.gateways4 = config.gateways4;
    client.netmask4 = config.netmask4;
    client.transaction_id = dhcphdr.get("xid");
    proc.journal(0, `${clid}: binding, with ${client.address4}`);

    // commit information
    config.clients[clid] = client;
    proc.device.store_set(DAEMON_DHCP_SERVER_STORE_KEY, store_data);

    let reply_opts: Uint8Array[] = [];

    let preq_list = opts.get(DHCP_TAGS.PARAMETER_REQUEST_LIST)
    if (preq_list) {
        for (let i = 0; i < preq_list.byteLength; i++) {
            let tag = preq_list[i];
            if (tag == DHCP_TAGS.SUBNET_MASK && client.netmask4) {
                reply_opts.push(DHCP_OPTION.create({
                    tag: DHCP_TAGS.SUBNET_MASK,
                    len: 4,
                    data: client.netmask4.buffer
                }).getBuffer())
            } else if (tag == DHCP_TAGS.ROUTER && client.gateways4?.length) {
                reply_opts.push(DHCP_OPTION.create({
                    tag: DHCP_TAGS.ROUTER,
                    len: client.gateways4.length * 4,
                    data: uint8_concat(client.gateways4.map(({ buffer }) => buffer))
                }).getBuffer())
            }
        }
    }

    let reply_dhcphdr = dhcphdr.create({
        op: DHCP_OP.BOOTREPLY,
        htype: 0x01,
        hlen: 0x06,
        yiaddr: client.address4,
        xid: dhcphdr.get("xid"),
        chaddr: dhcphdr.get("chaddr"),
        options: uint8_concat([
            DHCP_MAGIC_COOKIE,
            // Message Type
            DHCP_OPTION.create({
                tag: DHCP_TAGS.DHCP_MESSAGE_TYPE,
                len: 0x01,
                data: new Uint8Array([DHCP_MESSGAGE_TYPES.DHCPOFFER])
            }).getBuffer(),

            uint8_concat(reply_opts),

            // arbitrary time assignments
            // T1 Renewal Time
            DHCP_OPTION.create({ tag: DHCP_TAGS.RENEWAL_TIME_VALUE, len: 4, data: uint8_fromNumber(RENEWAL_TIME_IN_SECS, 4) }).getBuffer(),
            // T2 Rebinding Time
            DHCP_OPTION.create({ tag: DHCP_TAGS.REBINDING_TIME_VALUE, len: 4, data: uint8_fromNumber(REBINDING_TIME_IN_SECS, 4) }).getBuffer(),
            // IP Address Lease Time
            DHCP_OPTION.create({ tag: DHCP_TAGS.IP_ADDRESS_LEASE_TIME, len: 4, data: uint8_fromNumber(IPLEASE_TIME_IN_SECS, 4) }).getBuffer(),

            // SubnetMask
            DHCP_OPTION.create({ tag: DHCP_TAGS.SUBNET_MASK, len: 4, data: config.netmask4.buffer }).getBuffer(),

            // Server Identifier
            DHCP_OPTION.create({
                tag: DHCP_TAGS.SERVER_IDENTIFIER,
                len: config.server_id4.buffer.byteLength,
                data: config.server_id4.buffer
            }).getBuffer(),
            DHCP_END_OPTION
        ])
    });

    send_dhcp4(proc, contact, reply_dhcphdr, data);
}

function handle_request(proc: Process<typeof DAEMON_DHCP_SERVER>, contact: Contact<"IPv4", "RAW">, data: NetworkData, dhcphdr: typeof DHCP_HEADER, opts: ReturnType<typeof createDHCPOptionsMap>) {
    let clid = dhcp_server_serialize_clid(opts.get(DHCP_TAGS.CLIENT_IDENTIFIER) || dhcphdr.get("chaddr"));
    let store_data = get_store_data(proc.device);
    let config = store_data.configs[data.rcvif!.id()]!;
    let client = config.clients[clid];
    if (!client) {
        return;
    }
    // compare server_id
    let req_server_id = opts.get(DHCP_TAGS.SERVER_IDENTIFIER);
    if (!req_server_id || !config.server_id4 || !uint8_equals(req_server_id, config.server_id4.buffer)) {
        return;
    }

    let success = true;

    let subnet_mask_buf = opts.get(DHCP_TAGS.SUBNET_MASK);
    if (!subnet_mask_buf || !client.netmask4 || !uint8_equals(subnet_mask_buf, client.netmask4.buffer)) {
        success = false;
    }

    let req_ipbuf = opts.get(DHCP_TAGS.REQUESTED_IP_ADDRESS);
    if (!req_ipbuf || !client.address4 || !uint8_equals(req_ipbuf, client.address4.buffer)) {
        success = false;
    }

    let lease_time_buf = opts.get(DHCP_TAGS.IP_ADDRESS_LEASE_TIME);
    if (!lease_time_buf || uint8_readUint32BE(lease_time_buf) != client.lease_time) {
        success = false;
    }

    let router_buf = opts.get(DHCP_TAGS.ROUTER);
    if (router_buf) {
        if (!client.gateways4) {
            success = false;
        }

        while (router_buf.byteLength && success) {
            // check that address exists in params

            // if not found a match `success = false`
            if (!client.gateways4!.find(({ buffer }) =>
                uint8_equals(buffer, router_buf!.subarray(0, 4)))) {
                success = false;
                break;
            };

            router_buf = router_buf.subarray(4);
        }
    }

    if (!success) {
        let nakhdr = dhcphdr.create({
            op: DHCP_OP.BOOTREPLY,
            htype: dhcphdr.get("htype"),
            hlen: dhcphdr.get("hlen"),
            xid: dhcphdr.get("xid"),
            chaddr: dhcphdr.get("chaddr"),
            options: uint8_concat([
                DHCP_MAGIC_COOKIE,
                // DHCP Message Type
                DHCP_OPTION.create({
                    tag: DHCP_TAGS.DHCP_MESSAGE_TYPE,
                    len: 0x01,
                    data: new Uint8Array([DHCP_MESSGAGE_TYPES.DHCPNAK])
                }).getBuffer(),
                // Server Identifier
                DHCP_OPTION.create({
                    tag: DHCP_TAGS.SERVER_IDENTIFIER,
                    len: config.server_id4.buffer.byteLength,
                    data: config.server_id4.buffer
                }).getBuffer(),
                DHCP_END_OPTION
            ])
        })

        delete config.clients[clid];
        proc.device.store_set(DAEMON_DHCP_SERVER_STORE_KEY, store_data);
        return send_dhcp4(proc, contact, nakhdr, data);
    }

    let clid_buf = opts.get(DHCP_TAGS.CLIENT_IDENTIFIER);

    let ackhdr = dhcphdr.create({
        op: DHCP_OP.BOOTREPLY,
        htype: dhcphdr.get("htype"),
        hlen: dhcphdr.get("hlen"),
        xid: dhcphdr.get("xid"),
        chaddr: dhcphdr.get("chaddr"),
        options: uint8_concat([
            DHCP_MAGIC_COOKIE,
            // DHCP Message Type
            DHCP_OPTION.create({
                tag: DHCP_TAGS.DHCP_MESSAGE_TYPE,
                len: 0x01,
                data: new Uint8Array([DHCP_MESSGAGE_TYPES.DHCPACK])
            }).getBuffer(),
            // Server Identifier
            DHCP_OPTION.create({
                tag: DHCP_TAGS.SERVER_IDENTIFIER,
                len: config.server_id4.buffer.byteLength,
                data: config.server_id4.buffer
            }).getBuffer(),

            (clid_buf ? DHCP_OPTION.create({ tag: DHCP_TAGS.CLIENT_IDENTIFIER, len: clid_buf.length, data: clid_buf }).getBuffer() : new Uint8Array(0)),

            // SUBNET MASK
            DHCP_OPTION.create({
                tag: DHCP_TAGS.SUBNET_MASK,
                len: 0x04,
                data: subnet_mask_buf
            }).getBuffer(),
            // REQUESTED IP
            DHCP_OPTION.create({
                tag: DHCP_TAGS.REQUESTED_IP_ADDRESS,
                len: 0x04,
                data: req_ipbuf
            }).getBuffer(),
            // LEASE TIME
            DHCP_OPTION.create({
                tag: DHCP_TAGS.IP_ADDRESS_LEASE_TIME,
                len: 0x04,
                data: lease_time_buf
            }).getBuffer(),

            DHCP_END_OPTION
        ])
    });

    client.state = DHCPServerClientState.BOUND;
    proc.journal(0, `${clid}: bound, with ${client.address4}`);
    proc.device.store_set(DAEMON_DHCP_SERVER_STORE_KEY, store_data);
    return send_dhcp4(proc, contact, ackhdr, data);
}

function receive_ipv4(this: Process<typeof DAEMON_DHCP_SERVER>, contact: Contact<"IPv4", "RAW">, data: NetworkData) {
    if (!data.rcvif) throw new Error("unreachable");
    // The rcif must be of type ethernet header so that this thing can keep track of the rcvhwsaddr
    if (data.rcvif.header !== ETHERNET_HEADER) return;// 

    if (!data.destination || data.loopback) {
        return; // not interested
    }

    // first filter if there is an configuration for the rcviface
    let store_data = get_store_data(this.device);
    if (!store_data.configs[data.rcvif.id()]) {
        return; // not interested
    };

    let iphdr = IPV4_HEADER.from(data.buffer);
    if (calculateChecksum(iphdr.getBuffer().slice(0, iphdr.get("ihl") << 2)) != 0) {
        return; // not interested
    }

    if (iphdr.get("proto") != PROTOCOLS.UDP) {
        return;
    }

    let udphdr = UDP_HEADER.from(iphdr.get("payload"));
    if (udphdr.get("csum") > 0) {
        let pseudohdr = IPV4_PSEUDO_HEADER.create({
            saddr: iphdr.get("saddr"),
            daddr: iphdr.get("daddr"),
            proto: PROTOCOLS.UDP,
            len: udphdr.size
        });

        if (calculateChecksum(uint8_concat([pseudohdr.getBuffer(), udphdr.getBuffer()])) !== 0) {
            return; // bad checksum
        }
    }

    if (udphdr.get("sport") != DHCP_PORT_CLIENT || udphdr.get("dport") != DHCP_PORT_SERVER) {
        return; // not interested
    }

    let dhcphdr = DHCP_HEADER.from(udphdr.get("payload"));
    if (dhcphdr.get("op") != DHCP_OP.BOOTREQUEST) {
        return;
    }
    let opts = createDHCPOptionsMap(parseDHCPOptions(dhcphdr.get("options")));

    let tbuf = opts.get(DHCP_TAGS.DHCP_MESSAGE_TYPE);
    if (!tbuf) {
        console.warn("DHCP Message type missing")
        return;
    }

    // now there is room to do things as read the udp port and stuff ....
    switch (tbuf[0]) {
        case DHCP_MESSGAGE_TYPES.DHCPDISCOVER:
            return handle_discover(this, contact, data, dhcphdr, opts);
        case DHCP_MESSGAGE_TYPES.DHCPREQUEST:
            return handle_request(this, contact, data, dhcphdr, opts);
        default:
            throw new Error("unhandled DHCP message type")
    }
}
function receive_ipv6(this: Process<typeof DAEMON_DHCP_SERVER>, contact: Contact<"IPv6", "RAW">, data: NetworkData) {
    throw "not supported"
}

export const DAEMON_DHCP_SERVER_STORE_KEY = "DAEMON_DHCP_SERVER:STORE_KEY";
export const DAEMON_DHCP_SERVER: Program = {
    name: "daemon_dhcp_server",
    init(proc) {
        // assert only on instance of the process can run;
        if (proc.device.processes.items.find(p => p?.id.includes(this.name) && p != proc)) {
            proc.journal(1, "process already running");
            return ProcessSignal.ERROR;
        }

        proc.data = {};

        proc.resources.create(
            proc.device.contact_create("IPv4", "RAW").data!
        ).receive(receive_ipv4.bind(proc), { promiscuous: true });

        // IPv6 not supported in the initial re-write
        // proc.resources.create(
        //     proc.device.contact_create("IPv6", "RAW").data!
        // ).receive(receive_ipv6.bind(proc));

        return ProcessSignal.__EXPLICIT__;
    }
}

// 
// 
// Below are functions that act on the the storage data that the server uses
// 
// 

export function dhcp_server_client_init(device: Device, iface: BaseInterface, clid: string, address4: IPV4Address): ReturnType<typeof dhcp_server_iface_init> {
    let res = dhcp_server_iface_init(device, iface);
    if (!res.success) {
        return res;
    }

    let config = res.data;


    if (config.clients[clid]) {
        return {
            success: false, error: "clients", message: "client already exists"
        }
    }

    if (!config.netmask4.compare(address4, config.server_id4)) {
        return {
            success: false, error: "clients", message: "address must be in the correct subnet"
        }
    }

    config.clients[clid] = {
        lease_time: IPLEASE_TIME_IN_SECS,
        state: DHCPServerClientState.EXPIRED,
        transaction_id: -1,
        address4: address4,
        netmask4: config.netmask4
    }

    device.store_set(DAEMON_DHCP_SERVER_STORE_KEY, get_store_data(device));
    return { success: true, data: config }
}
export function dhcp_server_client_delete(device: Device, iface: BaseInterface, clid: string): ReturnType<typeof dhcp_server_iface_init> {
    let res = dhcp_server_iface_init(device, iface);
    if (!res.success) {
        return res;
    }

    let config = res.data;
    if (config.clients[clid]) {
        delete config.clients[clid];
        device.store_set(DAEMON_DHCP_SERVER_STORE_KEY, get_store_data(device));
    }

    return { success: true, data: config }
}

export function dhcp_server_gateways4_set(device: Device, iface: BaseInterface, ...gateways: IPV4Address[]): ReturnType<typeof dhcp_server_iface_init> {
    let res = dhcp_server_iface_init(device, iface);
    if (!res.success) {
        return res;
    }

    let config = res.data;

    if (!gateways.length) {
        return { success: true, data: config };
    }

    let gateways4: IPV4Address[] = [];
    // ensure that the gateways are in the correct subnet
    for (let a of gateways) {
        if (config.netmask4.compare(config.server_id4, a)) {
            gateways4.push(a);
        }
    }

    if (!gateways4.length) {
        return { success: false, error: "gateways4", message: "gateway must be in the same subnet as the server_id" }
    }

    config.gateways4 = gateways4;
    device.store_set(DAEMON_DHCP_SERVER_STORE_KEY, get_store_data(device));
    return { success: true, data: config }
}

export function dhcp_server_range4_add(device: Device, iface: BaseInterface, start: IPV4Address, end: IPV4Address): ReturnType<typeof dhcp_server_iface_init> {
    let res = dhcp_server_iface_init(device, iface);
    if (!res.success) {
        return res;
    }

    let config = res.data;
    // check that the address range makes sense
    if (!config.netmask4.compare(config.server_id4, start) || !config.netmask4.compare(config.server_id4, end)) {
        return {
            success: false, error: "address_range4", message: "address range is invalid"
        }
    }

    // check edge-cases where the start is an id and end is an broadcast
    // compute subnet-id 
    if (uint8_equals(
        and(config.netmask4.buffer, start.buffer), start.buffer
    )) {
        start = new IPV4Address(start);
        incrementAddress(start, config.netmask4);
    }

    // compute subnet-broadcast
    if (uint8_equals(
        and(config.netmask4.buffer, mutateNot(new Uint8Array(4))),
        end.buffer
    )) {
        // how is this address decremented
        // would it be just the final bit ?
        end.buffer[3] &= 0xfe;
    }

    if ((uint8_readUint32BE(end.buffer) - uint8_readUint32BE(start.buffer)) < 1) {
        return {
            success: false, error: "address_range4", message: "address range is invalid"
        }
    }

    config.address_range4 = [start, end];
    device.store_set(DAEMON_DHCP_SERVER_STORE_KEY, get_store_data(device));
    return { success: true, data: config };
}

export function dhcp_server_iface_delete(device: Device, iface: BaseInterface): DeviceResult<keyof DHCPServerConfig | "iface", undefined> {
    if (iface.header != ETHERNET_HEADER) {
        return {
            success: false, error: "iface", message: "only ethernet interfaces supported"
        }
    }

    let data = get_store_data(device);
    if (!data.configs[iface.id()]) {
        return { success: true, data: undefined }
    }

    delete data.configs[iface.id()];
    device.store_set(DAEMON_DHCP_SERVER_STORE_KEY, get_store_data(device));
    return { success: true, data: undefined }
}

export function dhcp_server_iface_init(device: Device, iface: BaseInterface): DeviceResult<keyof DHCPServerConfig | "iface", DHCPServerConfig> {
    if (iface.header != ETHERNET_HEADER) {
        return {
            success: false, error: "iface", message: "only ethernet interfaces supported"
        }
    }

    let data = get_store_data(device);
    let config = data.configs[iface.id()];

    if (config) {
        return { success: true, data: config }
    }
    let source = iface.addresses.find(a => a.address instanceof IPV4Address);
    if (!source) {
        return {
            success: false, error: "iface", message: "address configuration missing",
        }
    }

    config = {
        clients: {},
        server_id4: source.address,
        netmask4: source.netmask as AddressMask<typeof IPV4Address>
    }

    data.configs[iface.id()] = config;
    device.store_set(DAEMON_DHCP_SERVER_STORE_KEY, get_store_data(device));
    return { success: true, data: config }
}
