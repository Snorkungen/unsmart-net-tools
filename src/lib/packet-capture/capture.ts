import { PCAP_GLOBAL_HEADER, PCAP_MAGIC_NUMBER, PCAP_MAGIC_NUMBER_LITTLE } from "../header/pcap";
import { PacketCaptureHFormat, PacketCaptureNFormat, PacketCaptureRecordReader, PacketCaptureRecordReaderOptions } from "./reader";
import { PacketCaptureRecord } from "./record";

export class PacketCapture {
    records: PacketCaptureRecord[] = [];

    constructor(buf: Uint8Array) {
        let offset = 0;
        buf = Buffer.from(buf);

        let magicNumber = (<Buffer>buf).readUint32BE(0);

        /*
            This would be a great place to wrap the record reader with PacketCaptureReader

            that determines format & endiannes
        */

        let options: PacketCaptureRecordReaderOptions | null = null;

        if (magicNumber == PCAP_MAGIC_NUMBER) {
            options = <PacketCaptureRecordReaderOptions>{
                Hformat: PacketCaptureHFormat.libpcap,
                Nformat: PacketCaptureNFormat.unknown, // this will be figured out later
                bigEndian: true
            }
        } else if (magicNumber == PCAP_MAGIC_NUMBER_LITTLE) {
            options = <PacketCaptureRecordReaderOptions>{
                Hformat: PacketCaptureHFormat.libpcap,
                Nformat: PacketCaptureNFormat.unknown, // this will be figured out later
                bigEndian: false
            }
        }

        if (!options) {
            return;
        }

        let hdr = PCAP_GLOBAL_HEADER.from(buf.subarray(0, offset += PCAP_GLOBAL_HEADER.size), options);

        switch (hdr.get("network")) {
            case 1:
                options.Nformat = PacketCaptureNFormat.ethernet;
                break;
        }

        let recordReader = new PacketCaptureRecordReader(options);

        while (offset < buf.length) {
            recordReader.reset()
            let record = recordReader.read(buf, offset);
            record.index = this.records.push(
                record
            ) - 1;

            offset = recordReader.offset;
        }
    }
}