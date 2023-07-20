import { Buffer } from "buffer";
import { Device } from "../device";
import DeviceService from "./service";
import { Contact, ContactAddrFamily, ContactProto } from "../contact/contact";
import { ETHERNET_HEADER, ETHER_TYPES } from "../../header/ethernet";
import { Interface } from "../interface";
import { BROADCAST_MAC_ADDRESS } from "../neighbor-table";
import { IPV4_HEADER, IPV4_PSEUDO_HEADER, PROTOCOLS, createIPV4Header } from "../../header/ip";
import { UDP_HEADER } from "../../header/udp";
import { calculateChecksum } from "../../binary/checksum";
import { DCHP_OP, DCHP_PORT_CLIENT, DCHP_PORT_SERVER, DHCP_HEADER, DHCP_MAGIC_COOKIE, DHCP_OPTION } from "../../header/dhcp/dhcp";
import { DHCPParsedOptions, parseDHCPOptions } from "../../header/dhcp/parse-options";
import { DHCP_MESSGAGE_TYPES, DHCP_TAGS } from "../../header/dhcp/tags";
import { getKeyByValue } from "../../misc";
import { AddressMask } from "../../address/mask";
import { IPV4Address } from "../../address/ipv4";
import { UINT32, and, defineStruct, mutateAnd, mutateNot, mutateOr } from "../../binary";
import { bufferFromNumber } from "../../binary/buffer-from-number";
import { DHCP_END_OPTION } from "../../header/dhcp/dhcp";
import { UNSET_MAC_ADDRESS } from "../contact/contacts-handler";

enum DHCPServerState {
    BINDING,
    BOUND,
    EXPIRED
}

type DHCPServerConfiurationParameters = {
    state: DHCPServerState;
    ipv4Address?: IPV4Address;
}

type DHCPServerSerializedCLID = string;
function serializeClientID(inp: Buffer): DHCPServerSerializedCLID {
    return inp.toString("base64");
}

type DHCPServerConfig = {
    ipv4SubnetMask?: AddressMask<typeof IPV4Address>;
    ipv4AddressRange?: [start: IPV4Address, end: IPV4Address];
    /** This is a hack because i have no clue what i'm doing */
    iface?: Interface;
}

export default class DeviceServiceDHCPServer implements DeviceService {
    readonly device: Device;
    readonly config: Partial<DHCPServerConfig> = {}

    /** <https://www.rfc-editor.org/rfc/rfc213 1#section-2.1> IE Configuration Parameters Repository */
    repo: Map<DHCPServerSerializedCLID, DHCPServerConfiurationParameters> = new Map();

    contact: Contact<ContactAddrFamily.RAW, ContactProto.RAW>;

    constructor(device: Device) {
        this.device = device;
        this.contact = this.device.contactsHandler.createContact(ContactAddrFamily.RAW, ContactProto.RAW);
        this.contact.recieve = this.recieve.bind(this);

        console.warn(DeviceServiceDHCPServer.name + " will never be a full implementation.")
    }

    kill() {
        this.contact.close();
        console.warn("Service kill not implemented")
    }

    private get interfaces(): Interface[] {
        return this.device.interfaces;
    }

    private async getAddress(): Promise<IPV4Address | null> {
        if (!this.config?.ipv4AddressRange) return null;
        if (!this.config?.ipv4SubnetMask) return null;

        let reservedAddresses: Array<string> = [];

        for (let val of this.repo.values()) {
            if (!val.ipv4Address) continue;
            reservedAddresses.push(val.ipv4Address.toString());
        }

        let [start, end] = this.config.ipv4AddressRange;
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

            incrementAddress(addr, this.config.ipv4SubnetMask);
        }
    }

    private recieve(buf: Uint8Array) {
        let ethHdr = ETHERNET_HEADER.from(buf);
        if (
            ethHdr.get("dmac").toString() != BROADCAST_MAC_ADDRESS.toString()
            && !this.interfaces.find(({ macAddress }) => macAddress.toString() == ethHdr.get("dmac").toString())
        ) return;
        if (ethHdr.get("ethertype") != ETHER_TYPES.IPv4) return;

        let ipHdr = IPV4_HEADER.from(ethHdr.get("payload"));

        // This following code does not check for a subnet broadcast
        // if (
        //     ipHdr.get("daddr").toString() != "255.255.255.255"
        //     && !this.interfaces.find(({ ipv4Address }) => ipv4Address?.toString() == ipHdr.get("daddr").toString())
        // ) return;

        if (ipHdr.get("proto") != PROTOCOLS.UDP) return;
        console.log("Hek")

        // validate checksum
        if (calculateChecksum(ipHdr.getBuffer().subarray(0, 20)) != 0 && false /* Not check due to csum being optional <https://en.wikipedia.org/wiki/User_Datagram_Protocol> */) {
            console.warn("Recieved IPV4 Packet contains invalid \"checksum\"")
            return;
        }

        let udpHdr = UDP_HEADER.from(ipHdr.get("payload"));

        if (udpHdr.get("dport") !== DCHP_PORT_SERVER) {
            return;
        }

        // validate checksum
        if (!validateUDPV4Checksum(ipHdr, udpHdr)) {
            console.warn("Recieved UDO Packet contains invalid \"checksum\"")
            return;
        }

        let dhcpHdr = DHCP_HEADER.from(udpHdr.get("payload"));

        console.info("Hello Recieved DHCP Message")

        let opts = createOptionsMap(parseDHCPOptions(dhcpHdr.get("options")));

        let typeBuf = opts.get(DHCP_TAGS.DHCP_MESSAGE_TYPE);
        if (!typeBuf) {
            console.warn("DHCP Message type missing")
            return;
        }

        switch (typeBuf.readUint8(0)) {
            case DHCP_MESSGAGE_TYPES.DHCPDISCOVER:
                return this.handleDiscover(dhcpHdr, opts);

            default:
                console.warn("Unknown DHCP Message Type")
        }
    }

    private async handleDiscover(dhcpHdr: typeof DHCP_HEADER, opts: ReturnType<typeof createOptionsMap>) {
        if (!this.config.iface?.ipv4Address) return;

        let clientIdentifier: DHCPServerSerializedCLID = serializeClientID(
            opts.get(DHCP_TAGS.CLIENT_IDENTIFIER)
            || dhcpHdr.get("chaddr")
        );

        let address = await this.getAddress();

        if (!address) {
            return;
        }

        this.repo.set(
            clientIdentifier,
            {
                state: DHCPServerState.BINDING,
                ipv4Address: address
            }
        )


        const RENEWAL_TIME_IN_SECS = 60 * 15; // 15 mins
        const REBINDING_TIME_IN_SECS = 60 * 25; // 25 mins
        const IPLEASE_TIME_IN_SECS = 60 * 20; // 20 mins

        let replyOptions: Buffer[] = []

        if (opts.get(DHCP_TAGS.PARAMETER_REQUEST_LIST)) {
            let paramReqList = DHCP_OPTION.from(opts.get(DHCP_TAGS.PARAMETER_REQUEST_LIST)!);
            for (let i = 0; i < paramReqList.get("len"); i++) {
                let tag = paramReqList.get("data")[i];


                if (tag == DHCP_TAGS.SUBNET_MASK && this.config.ipv4SubnetMask) {
                    replyOptions.push(DHCP_OPTION.create({
                        tag: DHCP_TAGS.SUBNET_MASK,
                        len: 4,
                        data: this.config.ipv4SubnetMask.buffer
                    }).getBuffer())
                }
            }
        }

        let replyDHCPHdr = DHCP_HEADER.create({
            op: DCHP_OP.BOOTREPLY,
            htype: 0x01,
            hlen: 0x06,
            //...
            xid: dhcpHdr.get("xid"),
            //...
            yiaddr: address,
            //...
            chaddr: dhcpHdr.get("chaddr"),
            //...
            options: Buffer.concat([
                DHCP_MAGIC_COOKIE,
                // Message Type
                DHCP_OPTION.create({
                    tag: DHCP_TAGS.DHCP_MESSAGE_TYPE,
                    len: 0x01,
                    data: Buffer.from([DHCP_MESSGAGE_TYPES.DHCPOFFER])
                }).getBuffer(),

                Buffer.concat(replyOptions),

                // arbitrary time assignments

                // T1 Renewal Time
                DHCP_OPTION.create({ tag: DHCP_TAGS.RENEWAL_TIME_VALUE, len: 4, data: bufferFromNumber(RENEWAL_TIME_IN_SECS, 4) }).getBuffer(),
                // T2 Rebinding Time
                DHCP_OPTION.create({ tag: DHCP_TAGS.REBINDING_TIME_VALUE, len: 4, data: bufferFromNumber(REBINDING_TIME_IN_SECS, 4) }).getBuffer(),
                // IP Address Lease Time
                DHCP_OPTION.create({ tag: DHCP_TAGS.IP_ADDRESS_LEASE_TIME, len: 4, data: bufferFromNumber(IPLEASE_TIME_IN_SECS, 4) }).getBuffer(),

                // Server Identifier
                DHCP_OPTION.create({
                    tag: DHCP_TAGS.SERVER_IDENTIFIER,
                    len: 4,
                    data: this.config.iface.ipv4Address.buffer
                }).getBuffer(),
                DHCP_END_OPTION
            ])
        });

        let replyUdpHdr = UDP_HEADER.create({
            sport: DCHP_PORT_SERVER,
            dport: DCHP_PORT_CLIENT,
            length: UDP_HEADER.getMinSize() + replyDHCPHdr.size,
            payload: replyDHCPHdr.getBuffer(),
        })

        let saddr = this.config.iface.ipv4Address, daddr = new IPV4Address("255.255.255.255"), proto = PROTOCOLS.UDP;

        let pseudoHdr = IPV4_PSEUDO_HEADER.create({
            saddr, daddr, proto,
            len: replyUdpHdr.get("length")
        });

        replyUdpHdr.set("csum", calculateChecksum(pseudoHdr.getBuffer()));

        let replyIPHdr = createIPV4Header({
            saddr, daddr, proto,
            payload: replyUdpHdr.getBuffer()
        });
        let replyEthHdr = ETHERNET_HEADER.create({
            smac: UNSET_MAC_ADDRESS,
            dmac: BROADCAST_MAC_ADDRESS,
            ethertype: ETHER_TYPES.IPv4,
            payload: replyIPHdr.getBuffer()
        })

        this.contact.send(replyEthHdr.getBuffer());
    }

    configure(params: Partial<DHCPServerConfig>) {
        for (let key in params) {
            // @ts-ignore
            this.config[key] = params[key]
        }
    }
}

function validateUDPV4Checksum(ipHdr: typeof IPV4_HEADER, udpHdr: typeof UDP_HEADER): boolean {
    let pseudoHdr = IPV4_PSEUDO_HEADER.create({
        saddr: ipHdr.get("saddr"),
        daddr: ipHdr.get("daddr"),
        proto: ipHdr.get("proto"),
        len: udpHdr.size
    });

    return calculateChecksum(pseudoHdr.getBuffer()) == udpHdr.get("csum");
}

function createOptionsMap(opts: DHCPParsedOptions) {
    let map = new Map<typeof DHCP_TAGS[keyof typeof DHCP_TAGS], Buffer>;

    for (let opt of opts) {
        map.set(opt.get("tag"), opt.get("data"));
    }

    return map;
}

export function incrementAddress(address: IPV4Address, subnetMask: AddressMask<typeof IPV4Address>) {
    let diff = IPV4Address.ADDRESS_LENGTH - subnetMask.length;
    let size = Math.ceil(diff / 8)
    let bitMask = Buffer.alloc(size);

    let firstByteBitOffset = diff % 8;
    if (firstByteBitOffset > 0) {
        bitMask[0] = (2 ** firstByteBitOffset) - 1 << 8 - firstByteBitOffset;
    }

    let prevBuf = address.buffer.subarray(4 - size);
    let n = parseInt(prevBuf.toString("hex"), 16) + 1;
    let buf = bufferFromNumber(n, prevBuf.length)

    let leftBitMask = and(bitMask, prevBuf);
    mutateNot(bitMask);
    mutateAnd(buf, bitMask);
    mutateOr(buf, leftBitMask)

    address.buffer.set(buf, 4 - buf.length)
}   