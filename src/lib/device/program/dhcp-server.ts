import { IPV4Address } from "../../address/ipv4";
import { AddressMask, createMask } from "../../address/mask";
import { and, mutateNot, mutateAnd, mutateOr, not, or } from "../../binary";
import { calculateChecksum } from "../../binary/checksum";
import { uint8_concat, uint8_equals, uint8_fromNumber, uint8_readUint32BE } from "../../binary/uint8-array";
import { DCHP_OP, DCHP_PORT_CLIENT, DCHP_PORT_SERVER, DHCP_END_OPTION, DHCP_HEADER, DHCP_MAGIC_COOKIE, DHCP_OPTION } from "../../header/dhcp/dhcp";
import { parseDHCPOptions } from "../../header/dhcp/parse-options";
import { DHCP_MESSGAGE_TYPES, DHCP_TAGS } from "../../header/dhcp/tags";
import { createDHCPOptionsMap } from "../../header/dhcp/utils";
import { ETHERNET_HEADER, ETHER_TYPES } from "../../header/ethernet";
import { IPV4_HEADER, IPV4_PSEUDO_HEADER, PROTOCOLS } from "../../header/ip";
import { UDP_HEADER } from "../../header/udp";
import { Program, ProcessSignal, Process, Contact2, NetworkData, BaseInterface } from "../device2";

enum DHCPServerState {
    BINDING,
    BOUND,
    EXPIRED
}

type DHCPServerSerializedCLID = string;
function serializeClientID(buffer: Uint8Array): string {
    return buffer.reduce((res, v) => (
        res + v.toString(16)
    ), "")
}

type DHCPServerData = {
    /** server id */
    sid: Uint8Array;
    contact: Contact2;
    iface: BaseInterface;
    addressRange4: [start: IPV4Address, end: IPV4Address];
    netmask4: AddressMask<typeof IPV4Address>;
    gateways4?: IPV4Address[];


    /** <https://www.rfc-editor.org/rfc/rfc213 1#section-2.1> IE Configuration Parameters Repository */
    repo: Map<DHCPServerSerializedCLID, DHCPServerClientParameters>
}

type DHCPServerClientParameters = {
    state: DHCPServerState;
    xid: number;

    address4?: IPV4Address;
    netmask4?: AddressMask<typeof IPV4Address>;
    gateways4?: IPV4Address[];
    leaseTime?: number;

    /** server id */
    sid: Uint8Array;
}

const UNSET_IPV4_ADDRESS = new IPV4Address("0.0.0.0");
const BROADCAST_IPV4_ADDRESS = new IPV4Address("255.255.255.255");

function sendDHCPv4HdrServer(proc: Process<DHCPServerData>, dhcpHdr: typeof DHCP_HEADER, daddr: IPV4Address = BROADCAST_IPV4_ADDRESS, saddr?: IPV4Address) {

    if (!saddr) {
        let source = proc.data.iface.addresses.find(a => a.address instanceof IPV4Address);
        if (!source) return;
        saddr = source.address
    }

    let udphdr = UDP_HEADER.create({
        dport: DCHP_PORT_CLIENT,
        sport: DCHP_PORT_SERVER,
        payload: dhcpHdr.getBuffer(),
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
    })

    return proc.device.output_ipv4(({
        buffer: iphdr.getBuffer(),
        broadcast: true
    }), daddr, {
        destination: daddr,
        gateway: UNSET_IPV4_ADDRESS,
        netmask: createMask(IPV4Address, 0),
        iface: proc.data.iface
    })
}

function getAddress(proc: Process<DHCPServerData>): IPV4Address | null {
    let reservedAddresses: Array<string> = [];

    for (let val of proc.data.repo.values()) {
        if (!val.address4) continue;
        reservedAddresses.push(val.address4.toString());
    }

    let [start, end] = proc.data.addressRange4;
    let addr: IPV4Address = start;

    while (true) {
        if (!reservedAddresses.includes(addr.toString())) {
            console.warn("should do a ping request to ensure that address is not in use");
            return addr;
        }

        if (addr.toString() == end.toString()) {
            console.warn("should do some magic where i use an expired address");
            return null;
        }

        incrementAddress(addr, proc.data.netmask4);
    }
}

function handleDiscover(proc: Process<DHCPServerData>, dhcphdr: typeof DHCP_HEADER, opts: ReturnType<typeof createDHCPOptionsMap>) {
    let clientIdentifier: DHCPServerSerializedCLID = serializeClientID(
        opts.get(DHCP_TAGS.CLIENT_IDENTIFIER)
        || dhcphdr.get("chaddr")
    );

    let address: IPV4Address | null;
    let params = proc.data.repo.get(clientIdentifier);
    if (params?.address4) {
        address = params.address4;
    } else {
        address = getAddress(proc);
    }

    if (!address) {
        return;
    }

    const RENEWAL_TIME_IN_SECS = 60 * 15; // 15 mins
    const REBINDING_TIME_IN_SECS = 60 * 25; // 25 mins
    const IPLEASE_TIME_IN_SECS = 60 * 20; // 20 mins

    proc.data.repo.set(
        clientIdentifier,
        {
            state: DHCPServerState.BINDING,
            address4: address,
            netmask4: proc.data.netmask4,
            gateways4: proc.data.gateways4,
            sid: proc.data.sid,
            leaseTime: IPLEASE_TIME_IN_SECS,
            xid: dhcphdr.get("xid")
        }
    )

    let replyOptions: Uint8Array[] = []

    if (opts.get(DHCP_TAGS.PARAMETER_REQUEST_LIST)) {
        let paramReqList = opts.get(DHCP_TAGS.PARAMETER_REQUEST_LIST)!;

        for (let i = 0; i < paramReqList.byteLength; i++) {
            let tag = paramReqList[i];

            if (tag == DHCP_TAGS.SUBNET_MASK && proc.data.netmask4) {
                replyOptions.push(DHCP_OPTION.create({
                    tag: DHCP_TAGS.SUBNET_MASK,
                    len: 4,
                    data: new Uint8Array(proc.data.netmask4.buffer)
                }).getBuffer())
            } else if (tag == DHCP_TAGS.ROUTER && proc.data.gateways4?.length) {
                replyOptions.push(DHCP_OPTION.create({
                    tag: DHCP_TAGS.ROUTER,
                    len: proc.data.gateways4.length * 4,
                    data: uint8_concat(proc.data.gateways4.map(({ buffer }) => buffer))
                }).getBuffer())
            }
        }
    }

    let replyDHCPHdr = DHCP_HEADER.create({
        op: DCHP_OP.BOOTREPLY,
        htype: 0x01,
        hlen: 0x06,
        //...
        xid: dhcphdr.get("xid"),
        //...
        yiaddr: address,
        //...
        chaddr: dhcphdr.get("chaddr"),
        //...
        options: uint8_concat([
            DHCP_MAGIC_COOKIE,
            // Message Type
            DHCP_OPTION.create({
                tag: DHCP_TAGS.DHCP_MESSAGE_TYPE,
                len: 0x01,
                data: new Uint8Array([DHCP_MESSGAGE_TYPES.DHCPOFFER])
            }).getBuffer(),

            uint8_concat(replyOptions),

            // arbitrary time assignments

            // T1 Renewal Time
            DHCP_OPTION.create({ tag: DHCP_TAGS.RENEWAL_TIME_VALUE, len: 4, data: uint8_fromNumber(RENEWAL_TIME_IN_SECS, 4) }).getBuffer(),
            // T2 Rebinding Time
            DHCP_OPTION.create({ tag: DHCP_TAGS.REBINDING_TIME_VALUE, len: 4, data: uint8_fromNumber(REBINDING_TIME_IN_SECS, 4) }).getBuffer(),
            // IP Address Lease Time
            DHCP_OPTION.create({ tag: DHCP_TAGS.IP_ADDRESS_LEASE_TIME, len: 4, data: uint8_fromNumber(IPLEASE_TIME_IN_SECS, 4) }).getBuffer(),


            // SubnetMask
            DHCP_OPTION.create({ tag: DHCP_TAGS.SUBNET_MASK, len: 4, data: new Uint8Array(proc.data.netmask4.buffer) }).getBuffer(),

            // Server Identifier
            DHCP_OPTION.create({
                tag: DHCP_TAGS.SERVER_IDENTIFIER,
                len: proc.data.sid.byteLength,
                data: new Uint8Array(proc.data.sid)
            }).getBuffer(),
            DHCP_END_OPTION
        ])
    });

    let source = proc.data.iface.addresses.find(a => a.address instanceof IPV4Address);
    if (!source) return;
    sendDHCPv4HdrServer(proc, replyDHCPHdr, BROADCAST_IPV4_ADDRESS, source.address);
}

function handleRequest(proc: Process<DHCPServerData>, dhcphdr: typeof DHCP_HEADER, opts: ReturnType<typeof createDHCPOptionsMap>) {
    let clientIdentifier: DHCPServerSerializedCLID = serializeClientID(
        opts.get(DHCP_TAGS.CLIENT_IDENTIFIER)
        || dhcphdr.get("chaddr")
    )
    let params = proc.data.repo.get(clientIdentifier);

    if (!params) {
        console.warn("This DHCPServer only support the DHCP (DORA)[Discover, Offer, Requst, Ack] procedure")
        return;
    };

    let reqServerID = opts.get(DHCP_TAGS.SERVER_IDENTIFIER);
    if (!reqServerID || (!params.sid || !uint8_equals(reqServerID, params.sid))) {
        return
    }


    let success = true;

    let subnetMaskBuf = opts.get(DHCP_TAGS.SUBNET_MASK);
    if (!subnetMaskBuf || !uint8_equals(subnetMaskBuf, params.netmask4!.buffer /* #TRUSTMEBRO */)) {
        success = false;
    }

    let reqIPBuf = opts.get(DHCP_TAGS.REQUESTED_IP_ADDRESS);
    if (!reqIPBuf || !uint8_equals(reqIPBuf, params.address4!.buffer /* #TRUSTMEBRO */)) {
        success = false;
    }

    let leaseTimeBuf = opts.get(DHCP_TAGS.IP_ADDRESS_LEASE_TIME);
    if (!leaseTimeBuf || uint8_readUint32BE(leaseTimeBuf) != params.leaseTime) {
        success = false;
    }

    let routerBuf = opts.get(DHCP_TAGS.ROUTER);
    if (routerBuf) {
        // check that if a `routerBuf` check that routers are correct

        if (!params.gateways4) {
            success = false;
        }

        while (routerBuf.byteLength && success) {
            // check that address exists in params

            // if not found a match `success = false`
            if (!params.gateways4!.find(({ buffer }) =>
                uint8_equals(buffer, routerBuf!.subarray(0, 4)))) {
                success = false;
                break;
            };

            routerBuf = routerBuf.subarray(4);
        }
    }

    if (!success) {
        let nakDHCPHdr = DHCP_HEADER.create({
            op: DCHP_OP.BOOTREPLY,
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
                    len: params.sid.byteLength,
                    data: new Uint8Array(params.sid)
                }).getBuffer(),
                DHCP_END_OPTION
            ])
        })

        proc.data.repo.delete(clientIdentifier)
        return sendDHCPv4HdrServer(proc, nakDHCPHdr, BROADCAST_IPV4_ADDRESS);
    }

    let clid = opts.get(DHCP_TAGS.CLIENT_IDENTIFIER);
    let ackDHCPHdr = DHCP_HEADER.create({
        op: DCHP_OP.BOOTREPLY,
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
                len: params.sid.byteLength,
                data: new Uint8Array(params.sid)
            }).getBuffer(),

            (clid ? DHCP_OPTION.create({ tag: DHCP_TAGS.CLIENT_IDENTIFIER, len: clid.length, data: clid }).getBuffer() : new Uint8Array(0)),

            // SUBNET MASK
            DHCP_OPTION.create({
                tag: DHCP_TAGS.SUBNET_MASK,
                len: 0x04,
                data: subnetMaskBuf
            }).getBuffer(),
            // REQUESTED IP
            DHCP_OPTION.create({
                tag: DHCP_TAGS.REQUESTED_IP_ADDRESS,
                len: 0x04,
                data: reqIPBuf
            }).getBuffer(),
            // LEASE TIME
            DHCP_OPTION.create({
                tag: DHCP_TAGS.IP_ADDRESS_LEASE_TIME,
                len: 0x04,
                data: leaseTimeBuf
            }).getBuffer(),

            DHCP_END_OPTION
        ])
    })

    proc.data.repo.set(clientIdentifier, { ...params, state: DHCPServerState.BOUND })
    return sendDHCPv4HdrServer(proc, ackDHCPHdr, BROADCAST_IPV4_ADDRESS);
}

function receive(proc: Process<DHCPServerData>) {
    return function (_: Contact2, data: NetworkData) {
        if (data.rcvif != proc.data.iface)
            return;

        if (data.loopback)
            return; // do not handle loopback 

        let etherhdr = ETHERNET_HEADER.from(data.buffer);
        if (etherhdr.get("ethertype") != ETHER_TYPES.IPv4) {
            // only support DHCP(4)
            return;
        }

        let iphdr = IPV4_HEADER.from(etherhdr.get("payload"));
        if (calculateChecksum(iphdr.getBuffer().slice(0, iphdr.get("ihl") << 2)) != 0) {
            return;
        }

        if (iphdr.get("proto") != PROTOCOLS.UDP) {
            return;
        }

        let udphdr = UDP_HEADER.from(iphdr.get("payload"));
        // !TODO: validate checksum
        if (udphdr.get("sport") != DCHP_PORT_CLIENT || udphdr.get("dport") != DCHP_PORT_SERVER) {
            return;
        }

        let dhcphdr = DHCP_HEADER.from(udphdr.get("payload"));
        if (dhcphdr.get("op") != DCHP_OP.BOOTREQUEST) {
            return;
        }
        let opts = createDHCPOptionsMap(parseDHCPOptions(dhcphdr.get("options")));

        let typeBuf = opts.get(DHCP_TAGS.DHCP_MESSAGE_TYPE);
        if (!typeBuf) {
            console.warn("DHCP Message type missing")
            return;
        }

        switch (typeBuf[0]) {
            case DHCP_MESSGAGE_TYPES.DHCPDISCOVER:
                return handleDiscover(proc, dhcphdr, opts);
            case DHCP_MESSGAGE_TYPES.DHCPREQUEST:
                return handleRequest(proc, dhcphdr, opts);
            default:
                console.warn("Unknown DHCP Message Type")
        }
    }
}

export const DAEMON_DHCP_SERVER: Program<DHCPServerData> = {
    name: "daemon_dhcp_server",
    init(proc, [, ifid], data) {
        // check that program is not running
        if (proc.device.processes.find(p => p?.id.includes(this.name) && proc != p && proc.data.iface.id() == ifid)) {
            return ProcessSignal.EXIT;
        }

        let iface = data?.iface || proc.device.interfaces.find(f => f.id() == ifid);
        if (!iface || iface.header !== ETHERNET_HEADER) {
            // no iface found
            return ProcessSignal.ERROR;
        }

        console.warn(this.name + " is a bad implementation")

        let source = iface.addresses.find(a => a.address instanceof IPV4Address);
        if (!source) {
            return ProcessSignal.ERROR;
        }

        let addressRange4 = data?.addressRange4;
        if (!addressRange4) { // this is cursed, does not feel right
            let start = new IPV4Address(source.address); incrementAddress(start, source.netmask as AddressMask<typeof IPV4Address>);
            let end = new IPV4Address(or(start.buffer, not(source.netmask.buffer))); end.buffer[3] = end.buffer[3] ^ 1;
            addressRange4 = [start, end];
        }

        let contact = proc.device.contact_create("RAW", "RAW").data!;

        (<DHCPServerData>proc.data) = {
            sid: data?.sid || source.address.buffer,
            contact: contact,
            iface: iface,
            addressRange4: addressRange4,
            netmask4: source.netmask as AddressMask<typeof IPV4Address>,
            gateways4: data?.gateways4,

            repo: new Map()
        }

        proc.handle(proc, () => {
            contact.close(contact);
        })
        contact.receive(contact, receive(proc));

        return ProcessSignal.__EXPLICIT__;
    }
}

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