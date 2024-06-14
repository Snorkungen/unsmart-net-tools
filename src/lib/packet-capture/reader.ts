import { uint8_readUint32BE } from "../binary/uint8-array";
import { BaseAddress } from "../address/base";
import { PCAP_GLOBAL_HEADER, PCAP_MAGIC_NUMBER, PCAP_MAGIC_NUMBER_LITTLE, PCAP_RECORD_HEADER } from "../header/pcap";
import { PCAPNG_BLOCK, PCAPNG_BLOCK_TYPES, PCAPNG_BYTE_ORDER_MAGIC_BIG, PCAPNG_BYTE_ORDER_MAGIC_LITTLE, PCAPNG_EPACKET, PCAPNG_IFACE_DESC, PCAPNG_MAGIC_NUMBER, PCAPNG_OPTION, PCAPNG_SECTION_HEADER, PCAPNG_SPACKET } from "../header/pcapng";
import { ETHERNET_DOT1Q_HEADER, ETHERNET_HEADER, ETHER_TYPES } from "../header/ethernet";
import { ARP_HEADER, ARP_OPCODES } from "../header/arp";
import { IPV4_HEADER, IPV6_HEADER, PROTOCOLS } from "../header/ip";
import { ICMPV4_CODES, ICMPV4_TYPES, ICMPV6_TYPES, ICMP_ECHO_HEADER, ICMP_HEADER, ICMP_NDP_HEADER, ICMP_UNUSED_HEADER } from "../header/icmp";
import { TCP_HEADER } from "../header/tcp";
import { UDP_HEADER } from "../header/udp";

const getKeyByValue = <N extends number, T extends Record<string, N>>(obj: T, value: N): keyof T => Object.keys(obj).find(key => obj[key] === value) ?? "";

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
        data.protocol = getKeyByValue(PROTOCOLS, hdr.get("proto"));

        data.info.push(`ttl: ${hdr.get("ttl")}`);

        switch (hdr.get("proto")) {
            case PROTOCOLS.ICMP:
                return this.readICMPv4(hdr.getBuffer(), hdr.getMinSize(), data);
            case PROTOCOLS.UDP:
                return this.readUDP(hdr.getBuffer(), hdr.getMinSize(), data)
            case PROTOCOLS.TCP:
                return this.readTCP(hdr.getBuffer(), hdr.getMinSize(), data)
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
            case PROTOCOLS.UDP:
                return this.readUDP(hdr.getBuffer(), hdr.getMinSize(), data);
            case PROTOCOLS.TCP:
                return this.readTCP(hdr.getBuffer(), hdr.getMinSize(), data);
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
        data.info.push(`port: ${hdr.get("sport")} => ${hdr.get("dport")}`);

        // !TODO: create database of know destination and source ports

        return data;
    }

    private readTCP(buf: Uint8Array, begin: number, data: PacketCaptureRecordData): typeof data {
        let hdr = TCP_HEADER.from(buf.subarray(begin));
        data.info.push(`port: ${hdr.get("sport")} => ${hdr.get("dport")}`);

        // !TODO: create database of know destination and source portss

        return data;
    }
}

export class PacketCaptureLibpcapReader implements PacketCaptureReader {
    pointer: number;
    buffer: Uint8Array;

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
            index: -1,
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

function align_number(offset: number, align = 4) {
    return offset + (align - (offset % align)) % align;
    // return (align - (offset & (align - 1))) & (align - 1)
}
export class PacketCapturePcapngReader implements PacketCaptureReader {
    pointer: number;
    buffer: Uint8Array;

    ifaces: {
        /** <https://www.tcpdump.org/linktypes.html> */
        link_type: number;
        snap_len: number;
        tsresol: number;
        options: ReturnType<PacketCapturePcapngReader["read_options"]>;
    }[] = [];

    constructor(buffer: Uint8Array, private begin: number = 0) {
        this.buffer = buffer;
        this.pointer = begin;

        this.read_header_and_configure()
    }

    big_endian: boolean = false;
    private read_header_and_configure() {
        // assume that the first block is the section header

        // determine endidaness
        let magic = uint8_readUint32BE(this.buffer, this.pointer + 8); // the byte offset is determined by counting
        if (magic === PCAPNG_BYTE_ORDER_MAGIC_BIG) {
            this.big_endian = true;
        } else if (magic === PCAPNG_BYTE_ORDER_MAGIC_LITTLE) {
            this.big_endian = false;
        } else {
            throw new Error("ReaderError: magic number not recognized");
        }

        // read the first block
        let block = PCAPNG_BLOCK.from(
            this.buffer.subarray(this.pointer),
            { bigEndian: this.big_endian, packed: false } // endianes is not known yet.
        );

        let block_length = block.get("blockLength");

        let hdr = PCAPNG_SECTION_HEADER.from(
            this.buffer.subarray(this.pointer + PCAPNG_BLOCK.size, this.pointer + block_length),
            { bigEndian: this.big_endian, packed: false }
        );

        // byte_order has been read earlier
        if (hdr.get("versionMajor") !== 1) {
            throw new Error("ReaderError: version must be 1.x")
        }

        // !TODO: read the section length

        // read the options
        // !TODO: read options
        // let options = this.read_options(hdr.get("options"))
        // options.forEach(o => {
        //     console.log([...o.get("body")].map(n => String.fromCharCode(n)).join(""))
        // })

        this.pointer += align_number(block_length);
    }

    private read_options(arena: Uint8Array) {
        let options: (typeof PCAPNG_OPTION)[] = [];
        let arena_pointer = 0;

        while (arena_pointer < arena.byteLength) {
            let option = PCAPNG_OPTION.from(
                arena.subarray(arena_pointer, arena_pointer + PCAPNG_OPTION.size),
                { bigEndian: this.big_endian }
            );

            if (option.get("type") === 0) {
                break; // opt_endofopt
            }

            let option_length = option.get("length");

            options.push(
                PCAPNG_OPTION.from(arena.subarray(arena_pointer, arena_pointer + option_length + PCAPNG_OPTION.size),
                    { bigEndian: this.big_endian }
                )
            );

            arena_pointer += align_number(option_length + PCAPNG_OPTION.size);
        }

        return options;
    }

    has_more() {
        let local_pointer = this.pointer;
        while (local_pointer < this.buffer.byteLength) {
            let block = PCAPNG_BLOCK.from(
                this.buffer.subarray(local_pointer),
                { bigEndian: this.big_endian }
            );

            let block_type = block.get("type");
            if (block_type == PCAPNG_BLOCK_TYPES.SPACKET || block_type == PCAPNG_BLOCK_TYPES.EPACKET) {
                return true;
            }

            local_pointer += align_number(block.get("blockLength"));
        }

        return false;
    }

    reset(): void {
        this.ifaces = [];
        this.pointer = this.begin;
        this.read_header_and_configure();
    }
    read(): PacketCaptureRecord {
        let record: undefined | PacketCaptureRecord = undefined;

        while (this.pointer < this.buffer.byteLength) {
            let block = PCAPNG_BLOCK.from(
                this.buffer.subarray(this.pointer, this.pointer + PCAPNG_BLOCK.size),
                { bigEndian: this.big_endian }
            );

            let block_type = block.get("type");
            let block_length = block.get("blockLength")

            if (PCAPNG_BLOCK_TYPES.SECTION_HEADER === block_type) {
                this.read_header_and_configure();
                continue; // above function increments pointer
            } else if (PCAPNG_BLOCK_TYPES.IFACE_DESC === block_type) {
                // skip block
                let iface_desc = PCAPNG_IFACE_DESC.from(
                    this.buffer.subarray(this.pointer + PCAPNG_BLOCK.size, this.pointer + block_length - 4),
                    { bigEndian: this.big_endian }
                );

                let tsresol = 6; // default if_tsresol
                let options = this.read_options(iface_desc.get("options"));
                for (let opt of options) {
                    if (opt.get("type") === 9) {// if_tsresol
                        tsresol = opt.get("body")[0];
                    }
                }

                this.ifaces.push({
                    link_type: iface_desc.get("linkType"),
                    snap_len: iface_desc.get("snaplen"),
                    tsresol: tsresol,
                    options: options
                });
            } else if (PCAPNG_BLOCK_TYPES.SPACKET === block_type) {
                // read simple packet
                let spacket = PCAPNG_SPACKET.from(
                    this.buffer.subarray(this.pointer + PCAPNG_BLOCK.size, this.pointer + block_length - 4),
                    { bigEndian: this.big_endian }
                );

                let iface = this.ifaces[0]; // !TODO: read the spec, which interface is this expected to use

                if (iface) {
                    let metadata: PacketCaptureRecordMetaData = {
                        index: -1,
                        timestamp: new Date(NaN), // force invalid date due to no timestamp being provided
                        length: spacket.get("incLen"),
                        fullLength: spacket.get("origLen"),
                    };

                    // link-type 1: ethernet
                    if (iface.link_type === 1) {
                        let ethernet_reader = new PacketCaptureEthernetReader(spacket.get("body"), 0, metadata);
                        record = ethernet_reader.read(spacket.get("incLen"));
                    }
                }

            } else if (PCAPNG_BLOCK_TYPES.EPACKET === block_type) {
                // read enhanced packet
                let epacket = PCAPNG_EPACKET.from(
                    this.buffer.subarray(this.pointer + PCAPNG_BLOCK.size, this.pointer + block_length - 4),
                    { bigEndian: this.big_endian }
                );

                // get the iface
                let iface = this.ifaces[epacket.get("ifid")];
                if (iface) {
                    let ms = 0; // !TODO: read inteface description blocks and determine time resolution

                    let big_number = (BigInt(epacket.get("upperTimestamp")) << BigInt(8 * 4)) | BigInt(epacket.get("lowerTimestamp"));
                    if (iface.tsresol < 0x80) {
                        ms = Math.round(Number(big_number) * 10 ** -(iface.tsresol - 3))
                    }

                    if (iface.tsresol >= 0x80) {
                        // !TODO: support whatever this means (2) ** -x
                    }

                    let metadata: PacketCaptureRecordMetaData = {
                        index: -1,
                        timestamp: new Date(ms),
                        length: epacket.get("incLen"),
                        fullLength: epacket.get("origLen"),
                    }

                    // do something about the options
                    // let options = this.read_options(
                    //     epacket.get("body").subarray(align_number(epacket.get("incLen")))
                    // );

                    // link-type 1: ethernet
                    if (iface.link_type === 1) {
                        let ethernet_reader = new PacketCaptureEthernetReader(epacket.get("body"), 0, metadata);
                        record = ethernet_reader.read(epacket.get("incLen"));
                    }
                }
            }

            this.pointer += align_number(block_length);

            if (record) {
                return record;
            }
        }

        throw new Error("ReaderError: there is nothing to read")
    }

    static identify(buffer: Uint8Array) {
        return uint8_readUint32BE(buffer, 0) == PCAPNG_MAGIC_NUMBER;
    }
}
