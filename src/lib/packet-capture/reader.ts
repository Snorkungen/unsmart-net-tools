import { StructOptions, StructType } from "../binary";
import { ARP_HEADER, ARP_OPCODES } from "../header/arp";
import { ETHERNET_HEADER, ETHER_TYPES } from "../header/ethernet";
import { ICMPV4_CODES, ICMPV4_TYPES, ICMPV6_TYPES, ICMP_DESTINATION_UNREACHABLE, ICMP_ECHO_HEADER, ICMP_HEADER, ICMP_UNUSED_HEADER } from "../header/icmp";
import { IPV4_HEADER, PROTOCOLS } from "../header/ip";
import { PCAP_RECORD_HEADER } from "../header/pcap";
import { UDP_HEADER } from "../header/udp";
import { PacketCaptureRecord, PacketCaptureRecordData, PacketCaptureRecordMetaData, PacketCaptureRecordStatus } from "./record";

const getKeyByValue = <N extends number, T extends Record<string, N>>(obj: T, value: N): keyof T => Object.keys(obj).find(key => obj[key] === value) ?? "";




export enum PacketCaptureHFormat {
    unknown,
    /** libpcap 2.4 <https://wiki.wireshark.org/Development/LibpcapFileFormat> */
    libpcap,
}

/** network that the packets are encapsulated as */
export enum PacketCaptureNFormat {
    unknown,
    ethernet,
}

export type PacketCaptureRecordReaderOptions = {
    bigEndian: StructOptions["bigEndian"];
    /** Header Format */
    Hformat: PacketCaptureHFormat;
    /** Network Format */
    Nformat: PacketCaptureNFormat;
}

/**
    ### IMPORTANT NOTE!
    the current solution does'nt work for sub readers that need access to parent header
*/


export class PacketCaptureRecordReader {
    options: PacketCaptureRecordReaderOptions;
    offset: number = 0;

    constructor(options: PacketCaptureRecordReaderOptions) {
        this.options = options;
    }

    reset() {
        this.offset = 0;
    }

    read(buf: Uint8Array, offset: number): PacketCaptureRecord {
        this.offset = offset;
        // Read record header
        let recordMetaData = this.readRecordHeader(buf),
            // Read record data
            recordData = this.readRecordData(buf, recordMetaData.length);

        return Object.assign(recordMetaData, recordData);
    }

    readRecordHeader(buf: Uint8Array): PacketCaptureRecordMetaData {
        switch (this.options.Hformat) {
            case PacketCaptureHFormat.libpcap:
                return this.readRecordHeaderLibpcap(buf);
        }

        throw new Error(`header format: ${this.options.Hformat}, not implemented`);
    }

    readRecordHeaderLibpcap(buf: Uint8Array): PacketCaptureRecordMetaData {
        let hdr = PCAP_RECORD_HEADER.from(buf.subarray(this.offset, this.offset += PCAP_RECORD_HEADER.size), {
            bigEndian: this.options.bigEndian
        });

        let ms = Math.round((hdr.get("tsSec") * 1_000) + (hdr.get("tsUsec") / 1_000))

        return {
            index: 0, // due to it being unknown at this point
            timestamp: new Date(ms),
            length: hdr.get("inclLen"),
            fullLength: hdr.get("origLen")
        }
    }

    readRecordData(buf: Uint8Array, length: number): PacketCaptureRecordData {
        switch (this.options.Nformat) {
            case PacketCaptureNFormat.ethernet:
                return this.readEthernet(buf, length);
        }

        throw new Error(`network format: ${this.options.Hformat}, not implemented`);
    }

    readEthernet(buf: Uint8Array, length: number): PacketCaptureRecordData {
        let hdr = ETHERNET_HEADER.from(buf.subarray(this.offset, this.offset += length));
        let data: PacketCaptureRecordData = {
            saddr: hdr.get("smac"),
            daddr: hdr.get("dmac"),
            protocol: getKeyByValue(ETHER_TYPES, hdr.get("ethertype")),
            status: PacketCaptureRecordStatus.NORMAL,
            info: []
        }

        switch (hdr.get("ethertype")) {
            case ETHER_TYPES.ARP:
                return this.readARP(hdr.getBuffer(), hdr.getMinSize(), data)
            case ETHER_TYPES.IPv4:
                return this.readIPv4(hdr.getBuffer(), hdr.getMinSize(), data)
        }

        return data;
    }


    readARP(buf: Uint8Array, begin: number, data: PacketCaptureRecordData): PacketCaptureRecordData {
        let hdr = ARP_HEADER.from(buf.subarray(begin));

        if (hdr.get("ptype") != ETHER_TYPES.IPv4) {
            data.status = PacketCaptureRecordStatus.WARNING;
            data.info = ["ARP type not implemented"]
            return data
        }

        if (hdr.get("oper") == ARP_OPCODES.REQUEST) {
            data.info = [`${hdr.get("spa")} asks who has ${hdr.get("tpa")}?`]
        } else {
            data.info = [`${hdr.get("tpa")} is at ${hdr.get("tha")}.`]
        }

        return data;
    }

    readIPv4(buf: Uint8Array, begin: number, data: PacketCaptureRecordData): PacketCaptureRecordData {
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

    readICMPv4(buf: Uint8Array, begin: number, data: PacketCaptureRecordData): typeof data {
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

    readUDP(buf: Uint8Array, begin: number, data: PacketCaptureRecordData): typeof data {
        let hdr = UDP_HEADER.from(buf.subarray(begin));
        data.info.push(`port: ${hdr.get("sport")} => ${hdr.get("dport")}`)
        return data;
    }
}