import { Buffer } from "buffer";
import { Device } from "../device";
import DeviceService from "./service";
import { Contact, ContactAddrFamily, ContactProto } from "../contact/contact";
import { ETHERNET_HEADER, ETHER_TYPES } from "../../header/ethernet";
import { Interface } from "../interface";
import { BROADCAST_MAC_ADDRESS } from "../neighbor-table";
import { IPV4_HEADER, IPV4_PSEUDO_HEADER, PROTOCOLS } from "../../header/ip";
import { UDP_HEADER } from "../../header/udp";
import { calculateChecksum } from "../../binary/checksum";
import { DCHP_PORT_SERVER, DHCP_HEADER } from "../../header/dhcp/dhcp";
import { DHCPParsedOptions, parseDHCPOptions } from "../../header/dhcp/parse-options";
import { DHCP_MESSGAGE_TYPES, DHCP_TAGS } from "../../header/dhcp/tags";
import { getKeyByValue } from "../../misc";
import { AddressMask } from "../../address/mask";
import { IPV4Address } from "../../address/ipv4";
import { UINT32, and, defineStruct, mutateAnd, mutateNot, mutateOr } from "../../binary";
import { bufferFromNumber } from "../../binary/buffer-from-number";

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
}

export default class DeviceServiceDHCPServer implements DeviceService {
    readonly device: Device;
    readonly config: DHCPServerConfig = {}

    /** <https://www.rfc-editor.org/rfc/rfc2131#section-2.1> IE Configuration Parameters Repository */
    repo: Map<DHCPServerSerializedCLID, DHCPServerConfiurationParameters> = new Map();

    contact: Contact<ContactAddrFamily.RAW, ContactProto.RAW>;

    constructor(device: Device) {
        this.device = device;
        this.contact = this.device.contactsHandler.createContact(ContactAddrFamily.RAW, ContactProto.RAW);
        this.contact.recieve = this.recieve.bind(this);
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

        console.warn("Responding to dhcp discover not implemented")
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