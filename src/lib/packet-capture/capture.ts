import { PacketCaptureLibpcapReader, type PacketCaptureReader , type PacketCaptureRecord} from "./reader";

export class PacketCapture {
    records: PacketCaptureRecord[] = [];
    buffer: Uint8Array;
    reader: PacketCaptureReader;

    constructor(buf: Uint8Array) {
        this.buffer = new Uint8Array(buf);

        // identify the which reader to use
        if (PacketCaptureLibpcapReader.identify(this.buffer)) {
            this.reader = new PacketCaptureLibpcapReader(this.buffer, 0);
        } else {
            throw new Error("file not recognized")
        }

        this.readRecords();
    }

    private readRecords() {
        while (this.reader.has_more()) {
            let record = this.reader.read();
            this.records.push(record)
        }
    }
}