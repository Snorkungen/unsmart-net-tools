import { Buffer } from "buffer";
import { PCAP_GLOBAL_HEADER, PCAP_MAGIC_NUMBER, PCAP_MAGIC_NUMBER_LITTLE } from "../header/pcap";
import { PacketCaptureHFormat, PacketCaptureNFormat, PacketCaptureRecordReader, PacketCaptureRecordReaderOptions } from "./reader";
import { PacketCaptureRecord } from "./record";

export class PacketCapture {
    records: PacketCaptureRecord[] = [];

    private options: PacketCaptureRecordReaderOptions = {
        "Hformat": PacketCaptureHFormat.unknown,
        "Nformat": PacketCaptureNFormat.unknown,
        bigEndian: true,
    }

    private offset: number = 0;

    constructor(buf: Uint8Array) {
        let buffer = Buffer.from(buf);
        this.identifyHFormat(buffer);

        if (this.options.Hformat == PacketCaptureHFormat.unknown) {
            // return early; unknown file format not recognized
            return;
        }

        this.identifyNFormat(buffer);

        if (this.options.Nformat == PacketCaptureNFormat.unknown) {
            // return early; unknown network type
            return;
        }

        this.readRecords(buffer, this.offset)
    }


    private identifyHFormat(buffer: Buffer) {
        let magicNumber = buffer.readUint32BE(0);

        switch (magicNumber) {
            case PCAP_MAGIC_NUMBER:
                this.options.Hformat = PacketCaptureHFormat.libpcap;
                this.options.bigEndian = true;
                break;
            case PCAP_MAGIC_NUMBER_LITTLE:
                this.options.Hformat = PacketCaptureHFormat.libpcap;
                this.options.bigEndian = false;
        }
    }

    private identifyNFormat(buffer: Uint8Array) {
        switch (this.options.Hformat) {
            case PacketCaptureHFormat.libpcap:
                return this.readLibpcapHeader(buffer)
        }
    }

    private readLibpcapHeader (buffer: Uint8Array) {
        let hdr = PCAP_GLOBAL_HEADER.from(buffer.subarray(0, this.offset += PCAP_GLOBAL_HEADER.size), this.options);

        if (hdr.get("versionMajor") != 2 || hdr.get("versionMinor") != 4) {
            return;
        }

        switch (hdr.get("network")) {
            case 1:
                this.options.Nformat = PacketCaptureNFormat.ethernet;
                break;
        }
    }

    private readRecords(buffer: Buffer, begin: number) {
        let offset = begin;
        let recordReader = new PacketCaptureRecordReader(this.options);
        while (offset < buffer.length) {
            recordReader.reset()
            let record = recordReader.read(buffer, offset);
            record.index = this.records.push(
                record
            ) - 1;

            offset = recordReader.offset;
        }
    }
}