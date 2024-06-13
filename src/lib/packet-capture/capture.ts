import { PacketCaptureLibpcapReader, PacketCapturePcapngReader, type PacketCaptureReader, type PacketCaptureRecord } from "./reader";

export class PacketCapture {
    records: PacketCaptureRecord[] = [];
    buffer: Uint8Array;
    private reader?: PacketCaptureReader;

    constructor(buf: Uint8Array) {
        this.buffer = new Uint8Array(buf);

        // identify the which reader to use
        if (PacketCaptureLibpcapReader.identify(this.buffer)) {
            this.reader = new PacketCaptureLibpcapReader(this.buffer, 0);
        } else if (PacketCapturePcapngReader.identify(this.buffer)) {
            this.reader = new PacketCapturePcapngReader(this.buffer, 0);
        } else {
            return;
        }

        this.readRecords();
    }

    private readRecords() {
        if (!this.reader) {
            throw new Error("PacketCapture: reader not initialized")
        }

        while (this.reader.has_more()) {
            let record = this.reader.read();
            this.records.push(record)
            this.records[this.records.length - 1].index = this.records.length - 1;
        }
    }
}