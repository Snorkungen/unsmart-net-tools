import { IPV4Address } from "../../address/ipv4";
import { MACAddress } from "../../address/mac";
import { AddressMask, createMask } from "../../address/mask";
import { calculateChecksum } from "../../binary/checksum";
import { uint8_concat, uint8_equals, uint8_fromNumber, uint8_readUint32BE, uint8_set } from "../../binary/uint8-array";
import { DHCP_OP, DHCP_PORT_CLIENT, DHCP_PORT_SERVER, DHCP_END_OPTION, DHCP_HEADER, DHCP_MAGIC_COOKIE, DHCP_OPTION } from "../../header/dhcp/dhcp";
import { parseDHCPOptions } from "../../header/dhcp/parse-options";
import { DHCPTag, DHCP_MESSGAGE_TYPES, DHCP_TAGS } from "../../header/dhcp/tags";
import { createDHCPOptionsMap } from "../../header/dhcp/utils";
import { IPV4_HEADER, IPV4_PSEUDO_HEADER, PROTOCOLS } from "../../header/ip";
import { UDP_HEADER } from "../../header/udp";
import { getKeyByValue } from "../../misc";
import { _UNSET_ADDRESS_IPV4, address_is_unset, NetworkData } from "../device";
import { Contact, Process, ProcessSignal, Program } from "../device";
import { EthernetInterface } from "../interface";
import { ioprintln } from "./helpers";

const BROADCAST_IPV4_ADDRESS = new IPV4Address("255.255.255.255");

function createOptionBuffer(tag: DHCPTag, data: Uint8Array): Uint8Array {
    return DHCP_OPTION.create({
        tag: tag,
        len: data.length,
        data: data
    }).getBuffer();
}

enum DHCPC_State {
    DISCOVER,
    REQUEST,

    BOUND
}
type DHCPC_Offer = {
    server_id: Uint8Array;
    address4: IPV4Address;
    netmask4: AddressMask<typeof IPV4Address>;

    lease_time?: number;
    gateways4?: IPV4Address[];
}
type DHCPC_Data = {
    // only ethernet interfaces are supported, although there is nothin preventing this from blasting through all it's ports
    // yet this can be solved to wait write more programs to wait for the multiple discovers to resolve something, and then decide
    iface: EthernetInterface;
    contact: Contact;
    transaction_id: number;
    state: DHCPC_State;

    param_req_list: Uint8Array;

    offer?: DHCPC_Offer;
}

const __clid_buf = new Uint8Array([0x1, 0, 0, 0, 0, 0, 0]);
function clid_buf(input: MACAddress) {
    return uint8_set(__clid_buf, input.buffer, 1);
}

function send_dhcpc4({ iface, contact, transaction_id }: DHCPC_Data, hdr: typeof DHCP_HEADER) {
    // set the implied fields
    hdr.set("htype", 1);
    hdr.set("hlen", 6);
    hdr.set("chaddr", iface.macAddress.buffer); // I think Struct.set behaves correctly
    hdr.set("xid", transaction_id);

    // !TODO: to support sending with more specificity
    // meaning to use a better source and destination if their known ?
    let saddr = _UNSET_ADDRESS_IPV4;
    let daddr = BROADCAST_IPV4_ADDRESS;
    let allow_unset_saddr = true;
    let broadcast = true;
    let route = {
        destination: daddr,
        gateway: _UNSET_ADDRESS_IPV4,
        netmask: createMask(IPV4Address, IPV4Address.ADDRESS_LENGTH),
        iface: iface
    }

    let udphdr = UDP_HEADER.create({
        sport: DHCP_PORT_CLIENT,
        dport: DHCP_PORT_SERVER,
        payload: hdr.getBuffer()
    });
    udphdr.set("length", udphdr.size);

    let pseudohdr = IPV4_PSEUDO_HEADER.create({
        saddr: saddr,
        daddr: daddr,
        proto: PROTOCOLS.UDP,
        len: udphdr.get("length"),
    });
    udphdr.set("csum", calculateChecksum(
        uint8_concat([pseudohdr.getBuffer(), udphdr.getBuffer()])) || 0xFFFF
    );

    let iphdr = IPV4_HEADER.create({
        daddr, saddr,
        payload: udphdr.getBuffer(),
        proto: PROTOCOLS.UDP
    });

    let res = contact.send({
        buffer: iphdr.getBuffer(),
        broadcast: broadcast,
        allow_unset_saddr: allow_unset_saddr
    }, daddr, route);

    if (!res.success) {
        console.warn("send_dhcp4", "failed", res.message)
    }
}

function handle_offer(proc: Process<DHCPC_Data>, contact: Contact<"IPv4", "RAW">, netdata: NetworkData, hdr: typeof DHCP_HEADER, opts: ReturnType<typeof createDHCPOptionsMap>) {
    const { data } = proc
    if (data.state != DHCPC_State.DISCOVER) {
        return; // not interested
    }

    // !NOTE: this picks the first offer, that arrives

    let address = hdr.get("yiaddr")
    if (address_is_unset(address)) {
        return; // not interested
    }

    let server_id = opts.get(DHCP_TAGS.SERVER_IDENTIFIER)
    if (!server_id) {
        return; // missing information
    }

    let subnet_buf = opts.get(DHCP_TAGS.SUBNET_MASK)
    if (!subnet_buf) {
        return; // missing information
    }

    data.offer = {
        server_id: server_id,
        address4: address,
        netmask4: createMask(IPV4Address, subnet_buf),
    }

    // !TODO: read param_req_list

    // reply to offer
    let reply_options: Uint8Array[] = [
        DHCP_MAGIC_COOKIE,
        createOptionBuffer(DHCP_TAGS.DHCP_MESSAGE_TYPE, uint8_fromNumber(DHCP_MESSGAGE_TYPES.DHCPREQUEST, 1)), // DHCP MESSAGE TYPE
        createOptionBuffer(DHCP_TAGS.CLIENT_IDENTIFIER, clid_buf(data.iface.macAddress)), // DHCP CLIENT IDENTIFIER
        data.param_req_list,
        createOptionBuffer(DHCP_TAGS.SERVER_IDENTIFIER, opts.get(DHCP_TAGS.SERVER_IDENTIFIER)!)
    ];

    let lease_time_buf = opts.get(DHCP_TAGS.IP_ADDRESS_LEASE_TIME);
    if (lease_time_buf) {
        data.offer.lease_time = uint8_readUint32BE(lease_time_buf);
        reply_options.push(createOptionBuffer(DHCP_TAGS.IP_ADDRESS_LEASE_TIME, lease_time_buf));
    }

    if (subnet_buf) {
        reply_options.push(createOptionBuffer(DHCP_TAGS.SUBNET_MASK, subnet_buf))
    }

    let router_buf = opts.get(DHCP_TAGS.ROUTER);
    if (router_buf) {
        data.offer.gateways4 = [];
        for (let i = 0; i < router_buf.byteLength; i += 4) {
            data.offer.gateways4.push(new IPV4Address(router_buf.subarray(i, i + 4)))
        }
        reply_options.push(createOptionBuffer(DHCP_TAGS.ROUTER, router_buf));
    }

    reply_options.push(createOptionBuffer(
        DHCP_TAGS.REQUESTED_IP_ADDRESS,
        new Uint8Array(address.buffer)
    ));

    // LAST OPTION
    reply_options.push(DHCP_END_OPTION)


    let replyhdr = DHCP_HEADER.create({
        op: DHCP_OP.BOOTREQUEST,
        xid: data.transaction_id,
        options: uint8_concat(reply_options),
    });

    data.state = DHCPC_State.REQUEST;
    ioprintln(proc.io, "[INFO] sending request")
    return send_dhcpc4(data, replyhdr);
}

function handle_ack(proc: Process<DHCPC_Data>, contact: Contact<"IPv4", "RAW">, netdata: NetworkData, hdr: typeof DHCP_HEADER, opts: ReturnType<typeof createDHCPOptionsMap>) {
    const { data } = proc;
    if (data.state != DHCPC_State.REQUEST) {
        throw new Error("ack to request only supported")
    }

    if (!data.offer) {
        throw new Error("something went wrong")
    }

    let sid = opts.get(DHCP_TAGS.SERVER_IDENTIFIER);
    if (!sid || !uint8_equals(data.offer?.server_id, sid)) {
        return; // not interested
    }

    ioprintln(proc.io, "[INFO] committing DHCP " + data.offer.address4);
    console.log("COMMITING DHCP " + data.offer.address4);

    data.state = DHCPC_State.BOUND;
    proc.device.interface_address_set(data.iface, data.offer.address4, data.offer.netmask4);

    // set gateways
    if (data.offer.gateways4) {
        for (let gateway of data.offer.gateways4) {
            proc.device.interface_route_set(data.iface, new IPV4Address("0.0.0.0"), createMask(IPV4Address, 0), gateway)
        }
    }

    if (data.offer.lease_time) {
        // potentially in the future schedule a timed event to fire ...
        // i.e revalidate
    }

    ioprintln(proc.io, "[INFO] closing dhcpc4");
    return proc.close(ProcessSignal.INTERRUPT);
}

function receive_ipv4(this: Process<DHCPC_Data>, contact: Contact<"IPv4", "RAW">, data: NetworkData) {
    if (!data.rcvif) throw new Error("unreachable");
    if (data.rcvif !== this.data.iface) {
        return; // 
    }

    if (!data.destination || data.loopback) {
        return; // not interested
    }

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

    if (udphdr.get("sport") != DHCP_PORT_SERVER || udphdr.get("dport") != DHCP_PORT_CLIENT) {
        return; // not interested
    }

    let dhcphdr = DHCP_HEADER.from(udphdr.get("payload"));
    if (dhcphdr.get("op") != DHCP_OP.BOOTREPLY) {
        return;
    }

    if (dhcphdr.get("xid") != this.data.transaction_id) {
        return; // not interested
    }

    let opts = createDHCPOptionsMap(parseDHCPOptions(dhcphdr.get("options")));

    let tbuf = opts.get(DHCP_TAGS.DHCP_MESSAGE_TYPE);
    if (!tbuf) {
        console.warn("DHCP Message type missing")
        return;
    }

    ioprintln(this.io, `[INFO] received ${getKeyByValue(DHCP_MESSGAGE_TYPES, tbuf[0])}`);
    switch (tbuf[0]) {
        case DHCP_MESSGAGE_TYPES.DHCPOFFER:
            return handle_offer(this, contact, data, dhcphdr, opts);
        case DHCP_MESSGAGE_TYPES.DHCPACK:
            return handle_ack(this, contact, data, dhcphdr, opts);
    }
}

export const DEVICE_PROGRAM_DHCP_CLIENT: Program<DHCPC_Data> = {
    name: "dhcpc4",
    init(proc, [, ifid]) {
        let iface = proc.device.interfaces.find(f => f.id() == ifid);
        if (!iface || !(iface instanceof EthernetInterface)) {
            ioprintln(proc.io, "no interface found")
            return ProcessSignal.ERROR;
        }

        let contact = proc.resources.create(
            proc.device.contact_create("IPv4", "RAW").data!
        );

        // !TODO: check if interface is configured with an address 

        // initialize something
        proc.data = {
            iface: iface,
            contact: contact,

            transaction_id: Math.floor(Math.random() * (2 ** 14)),

            state: DHCPC_State.DISCOVER,

            param_req_list: createOptionBuffer(DHCP_TAGS.PARAMETER_REQUEST_LIST, new Uint8Array([
                DHCP_TAGS.SUBNET_MASK,
                DHCP_TAGS.ROUTER,
                // DHCP_TAGS.DOMAIN_NAME_SERVER
            ]))
        };

        // now prepare to send
        let discoverhdr = DHCP_HEADER.create({
            op: DHCP_OP.BOOTREQUEST,
            xid: proc.data.transaction_id,
            options: uint8_concat([
                DHCP_MAGIC_COOKIE,
                createOptionBuffer(DHCP_TAGS.DHCP_MESSAGE_TYPE, uint8_fromNumber(DHCP_MESSGAGE_TYPES.DHCPDISCOVER, 1)), // DHCP MESSAGE TYPE
                createOptionBuffer(DHCP_TAGS.CLIENT_IDENTIFIER, clid_buf(iface.macAddress)), // DHCP CLIENT IDENTIFIER
                proc.data.param_req_list,
                DHCP_END_OPTION
            ])
        })

        contact.receive(receive_ipv4.bind(proc))

        // send header
        send_dhcpc4(proc.data, discoverhdr);
        ioprintln(proc.io, "[INFO] sending discover");

        return ProcessSignal.__EXPLICIT__;
    }
}