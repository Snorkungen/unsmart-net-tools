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

enum DHCPServerState {
    BINDING,
    BOUND,
    EXPIRED
}

type DHCPServerConfiurationParameters = {
    state: DHCPServerState;
}

type DHCPServerSerializedCLID = string | string;
function serializeClientID(inp: Buffer): DHCPServerSerializedCLID {
    return inp.toString("base64");
}

export default class DeviceServiceDHCPServer implements DeviceService {
    readonly device: Device;
    readonly config: Array<string> = [];

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
    private recieve(buf: Uint8Array) {
        let ethHdr = ETHERNET_HEADER.from(buf);
        
        if (
            ethHdr.get("dmac").toString() != BROADCAST_MAC_ADDRESS.toString()
            && !this.interfaces.find(({ macAddress }) => macAddress.toString() == ethHdr.get("dmac").toString())
        ) return;
        if (ethHdr.get("ethertype") != ETHER_TYPES.IPv4) return;

        let ipHdr = IPV4_HEADER.from(ethHdr.get("payload"));

        if (
            ipHdr.get("daddr").toString() != "255.255.255.255"
            && !this.interfaces.find(({ ipv4Address }) => ipv4Address?.toString() == ipHdr.get("daddr").toString())
        ) return;

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