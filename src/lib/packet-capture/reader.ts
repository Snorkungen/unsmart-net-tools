import { BaseAddress } from "../address/base";
import { uint8_readUint32BE } from "../binary/uint8-array";
import { ARP_HEADER, ARP_OPCODES } from "../header/arp";
import { ETHERNET_DOT1Q_HEADER, ETHERNET_HEADER, ETHER_TYPES } from "../header/ethernet";
import { ICMPV4_CODES, ICMPV4_TYPES, ICMPV6_TYPES, ICMP_DESTINATION_UNREACHABLE, ICMP_ECHO_HEADER, ICMP_HEADER, ICMP_NDP_HEADER, ICMP_UNUSED_HEADER } from "../header/icmp";
import { IPV4_HEADER, IPV6_HEADER, PROTOCOLS } from "../header/ip";
import { PCAP_GLOBAL_HEADER, PCAP_MAGIC_NUMBER, PCAP_MAGIC_NUMBER_LITTLE, PCAP_RECORD_HEADER } from "../header/pcap";
import { UDP_HEADER } from "../header/udp";

const getKeyByValue = <N extends number, T extends Record<string, N>>(obj: T, value: N): keyof T => Object.keys(obj).find(key => obj[key] === value) ?? "";

export enum PacketCaptureHFormat {
    unknown,
    /** libpcap 2.4 <https://wiki.wireshark.org/Development/LibpcapFileFormat> */
    libpcap,

    /** pcapng 1.0 */
    pcapng,
}

/** network that the packets are encapsulated as */
export enum PacketCaptureNFormat {
    unknown,
    ethernet,
}

export enum PacketCaptureRecordStatus {
    NORMAL,
    WARNING,
    ERROR,
}

export interface PacketCaptureRecordMetaData {
    index: number;
    timestamp: Date;
    length: number;
    fullLength: number;
}

export interface PacketCaptureRecordData {
    saddr: BaseAddress;
    daddr: BaseAddress;
    protocol: string;
    status: PacketCaptureRecordStatus;

    info: string[];
}

export type PacketCaptureRecord = PacketCaptureRecordMetaData & PacketCaptureRecordData;

export interface PacketCaptureReader {
    /** has_more is for pcapng where the next block 
     * might be some configuration with no packets after it so you would have to look ahead
     *  and see if there are packets left */
    has_more(): boolean;
    reset(): void;
    read(length?: number): PacketCaptureRecord;
}

export class PacketCaptureEthernetReader implements PacketCaptureReader {
    constructor(private buffer: Uint8Array, private begin: number, private metadata: PacketCaptureRecordMetaData) { }

    private read_called = false
    has_more(): boolean { return !this.read_called }
    reset(): void { this.read_called = false }

    read(length?: number): PacketCaptureRecord {
        this.read_called = true;
        return Object.assign(this.metadata, this.readEthernet(this.buffer.subarray(this.begin, length ? this.begin + length : undefined), 0))
    }

    private readEthernet(buf: Uint8Array, begin?: number, data?: PacketCaptureRecordData): PacketCaptureRecordData {
        let hdr = ETHERNET_HEADER.from(buf.subarray(begin || 0));

        if (!data) {
            data = {
                saddr: hdr.get("smac"),
                daddr: hdr.get("dmac"),
                protocol: getKeyByValue(ETHER_TYPES, hdr.get("ethertype")),
                status: PacketCaptureRecordStatus.NORMAL,
                info: []
            }
        } else {
            data.protocol = getKeyByValue(ETHER_TYPES, hdr.get("ethertype"))
        }

        switch (hdr.get("ethertype")) {
            case ETHER_TYPES.ARP:
                return this.readARP(hdr.getBuffer(), hdr.getMinSize(), data)
            case ETHER_TYPES.VLAN:
                return this.readVLAN(hdr.getBuffer(), hdr.getMinSize(), data)
            case ETHER_TYPES.IPv4:
                return this.readIPv4(hdr.getBuffer(), hdr.getMinSize(), data)
            case ETHER_TYPES.IPv6:
                return this.readIPv6(hdr.getBuffer(), hdr.getMinSize(), data)
        }

        return data;
    }

    private readVLAN(buf: Uint8Array, begin: number, data: PacketCaptureRecordData): PacketCaptureRecordData {
        let hdr = ETHERNET_DOT1Q_HEADER.from(buf.subarray(begin));

        data.info = ["VLAN/" + hdr.get("vid")]

        // mess with the buf

        let ethhdr = ETHERNET_HEADER.from(buf);
        ethhdr.set("ethertype", hdr.get("ethertype"));
        ethhdr.set("payload", hdr.get("payload"));

        return this.readEthernet(ethhdr.getBuffer(), 0, data);
    }

    private readARP(buf: Uint8Array, begin: number, data: PacketCaptureRecordData): PacketCaptureRecordData {
        let hdr = ARP_HEADER.from(buf.subarray(begin));

        if (hdr.get("ptype") != ETHER_TYPES.IPv4) {
            data.status = PacketCaptureRecordStatus.WARNING;
            data.info.push("ARP type not implemented")
            return data
        }

        if (hdr.get("oper") == ARP_OPCODES.REQUEST) {
            data.info.push(`${hdr.get("spa")} asks who has ${hdr.get("tpa")}?`)
        } else {
            data.info.push(`${hdr.get("tpa")} is at ${hdr.get("tha")}.`)
        }

        return data;
    }

    private readIPv4(buf: Uint8Array, begin: number, data: PacketCaptureRecordData): PacketCaptureRecordData {
        let hdr = IPV4_HEADER.from(buf.subarray(begin));

        data.saddr = hdr.get("saddr");
        data.daddr = hdr.get("daddr");
        data.protocol = getKeyByValue(PROTOCOLS, hdr.get("proto"))

        data.info.push(`ttl: ${hdr.get("ttl")}`)

        switch (hdr.get("proto")) {
            case PROTOCOLS.ICMP:
                return this.readICMPv4(hdr.getBuffer(), hdr.getMinSize(), data);
            case PROTOCOLS.UDP:
                return this.readUDP(hdr.getBuffer(), hdr.getMinSize(), data)
        }

        return data;
    }

    private readICMPv4(buf: Uint8Array, begin: number, data: PacketCaptureRecordData): typeof data {
        let hdr = ICMP_HEADER.from(buf.subarray(begin));
        let echoHdr = ICMP_ECHO_HEADER.from(hdr.get("data")),
            dstUnrchbleHdr = ICMP_UNUSED_HEADER.from(hdr.get("data"))
        switch (hdr.get("type")) {
            case ICMPV4_TYPES.ECHO_REPLY:
                data.info.push(`Echo Reply: id=${echoHdr.get("id")}, seq=${echoHdr.get("seq")}`)
                break;
            case ICMPV4_TYPES.ECHO_REQUEST:
                data.info.push(`Echo Request: id=${echoHdr.get("id")}, seq=${echoHdr.get("seq")}`)
                break;
            case ICMPV4_TYPES.DESTINATION_UNREACHABLE:
                data.info.push(`Destination Unreachable`, getKeyByValue(ICMPV4_CODES[ICMPV4_TYPES.DESTINATION_UNREACHABLE], hdr.get("code")))
                data.status = PacketCaptureRecordStatus.WARNING;
                data.info = this.readIPv4(dstUnrchbleHdr.get("data"), 0, data).info
                break;
            case ICMPV4_TYPES.TIME_EXCEEDED:
                data.info.push(`Time Exceeded`, getKeyByValue(ICMPV4_CODES[ICMPV4_TYPES.TIME_EXCEEDED], hdr.get("code")))
                data.status = PacketCaptureRecordStatus.WARNING;
                data.info = this.readIPv4(dstUnrchbleHdr.get("data"), 0, data).info
                break;

        }

        return data;
    }

    private readIPv6(buf: Uint8Array, begin: number, data: PacketCaptureRecordData): typeof data {
        let hdr = IPV6_HEADER.from(buf.subarray(begin));

        data.saddr = hdr.get("saddr");
        data.daddr = hdr.get("daddr");
        data.protocol = getKeyByValue(PROTOCOLS, hdr.get("nextHeader"))

        switch (hdr.get("nextHeader")) {
            case PROTOCOLS.IPV6_ICMP:
                return this.readICMPv6(hdr.getBuffer(), hdr.getMinSize(), data);
        }

        return data;
    }

    private readICMPv6(buf: Uint8Array, begin: number, data: PacketCaptureRecordData): typeof data {
        let ipHdr = IPV6_HEADER.from(buf);
        let hdr = ICMP_HEADER.from(buf.subarray(begin));
        let echoHdr = ICMP_ECHO_HEADER.from(hdr.get("data"))
        let ndpHdr = ICMP_NDP_HEADER.from(hdr.get("data"))

        switch (hdr.get("type")) {
            case ICMPV6_TYPES.ECHO_REPLY:
                data.info.push(`Echo Reply: id=${echoHdr.get("id")}, seq=${echoHdr.get("seq")}`)
                break;
            case ICMPV6_TYPES.ECHO_REQUEST:
                data.info.push(`Echo Request: id=${echoHdr.get("id")}, seq=${echoHdr.get("seq")}`)
                break;
            case ICMPV6_TYPES.NEIGHBOR_SOLICITATION:
                data.info.push(`${ipHdr.get("saddr")} asks who has ${ndpHdr.get("targetAddress")};`)
            case ICMPV6_TYPES.NEIGHBOR_ADVERTISMENT:
                break;
        }
        return data;
    }

    private readUDP(buf: Uint8Array, begin: number, data: PacketCaptureRecordData): typeof data {
        let hdr = UDP_HEADER.from(buf.subarray(begin));
        data.info.push(`port: ${hdr.get("sport")} => ${hdr.get("dport")}`)
        return data;
    }
}

export class PacketCaptureLibpcapReader implements PacketCaptureReader {
    pointer: number;
    buffer: Uint8Array;

    record_index: number = 0;

    network_type: PacketCaptureNFormat = PacketCaptureNFormat.unknown;

    big_endian: boolean = false;
    version: [number, number] = [2, 4];
    sigfig: number = 0;
    snaplen: number = 0;
    thiszone: number = 0;

    constructor(buffer: Uint8Array, private begin: number = 0) {
        this.buffer = buffer;
        this.pointer = begin;

        this.read_header_and_configure()
    }

    private read_header_and_configure() {
        // read global header determine if the headers are big-endian or little endian move pointer

        // first read magic value and check if it is big endian or little endiand
        let magic = uint8_readUint32BE(this.buffer, this.pointer);
        if (magic === PCAP_MAGIC_NUMBER) {
            this.big_endian = true;
        } else if (magic === PCAP_MAGIC_NUMBER_LITTLE) {
            this.big_endian = false;
        } else {
            throw new Error("ReaderError: magic number not recognized");
        }

        let hdr = PCAP_GLOBAL_HEADER.from(
            this.buffer.subarray(this.pointer, this.pointer + PCAP_GLOBAL_HEADER.size),
            { bigEndian: this.big_endian }
        );

        if (hdr.get("versionMajor") != 2 || hdr.get("versionMinor") != 4) {
            throw new Error("ReaderError: version MUST be 2.4");
        }

        switch (hdr.get("network")) {
            case 1:
                this.network_type = PacketCaptureNFormat.ethernet;
                break;
            default:
                throw new Error("ReaderError: reader only supports reading ethernet packets")
        }

        // save header information
        this.version = [hdr.get("versionMajor"), hdr.get("versionMinor")]
        this.sigfig = hdr.get("sigfigs");
        this.snaplen = hdr.get("snaplen");
        this.thiszone = hdr.get("thiszone");

        // move the pointer forward
        this.pointer += PCAP_GLOBAL_HEADER.size;
    }

    has_more() {
        return this.pointer < this.buffer.length;
    }

    reset() {
        this.pointer = this.begin;
        this.read_header_and_configure();
    }

    read(): PacketCaptureRecord {
        // first read the record header
        let hdr = PCAP_RECORD_HEADER.from(
            this.buffer.subarray(this.pointer, this.pointer + PCAP_RECORD_HEADER.size),
            { bigEndian: this.big_endian }
        );

        let ms = Math.round((hdr.get("tsSec") * 1_000) + (hdr.get("tsUsec") / 1_000))
        let metadata: PacketCaptureRecordMetaData = {
            index: this.record_index++,
            timestamp: new Date(ms),
            length: hdr.get("inclLen"),
            fullLength: hdr.get("origLen"),
        }

        // increment pointer after reading record header
        this.pointer += PCAP_RECORD_HEADER.size;

        let record: PacketCaptureRecord;
        // second read the packet
        if (this.network_type == PacketCaptureNFormat.ethernet) {
            let ethernet_reader = new PacketCaptureEthernetReader(this.buffer, this.pointer, metadata);
            record = ethernet_reader.read(metadata.length);
        } else {
            throw new Error("ReaderError: network type not supported")
        }

        // increment pointer after reading ethernet packet
        this.pointer += metadata.length;

        return record;
    }

    static identify(buffer: Uint8Array) {
        let magic_number = uint8_readUint32BE(buffer);
        return magic_number == PCAP_MAGIC_NUMBER || magic_number == PCAP_MAGIC_NUMBER_LITTLE;
    }
}


