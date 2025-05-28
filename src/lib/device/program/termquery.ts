import { ASCIICodes, CSI, numbertonumbers, readParams } from "../../terminal/shared";
import { Process, ProcessSignal, Program } from "../device";

export type TermQuery = Partial<{
    width: number;
}>;

const MAX_QUERY_WAIT = 3;

/**
 * Query the connected terminal for information and stuff ...
 */
export function termquery(proc: Process): Promise<TermQuery> {
    const data: TermQuery = {};

    return new Promise((resolve) => {
        // !TODO: use a future better proc-device scheduling
        const sched_id = proc.device.schedule(() => {

            proc.io.read = io_reader;
            resolve(data)
        }, MAX_QUERY_WAIT);

        let original_cursor_position: undefined | number = undefined;
        let io_reader = proc.io.read;
        proc.io.read = (bytes) => {
            // assume that the ctrl code is the only data in the bytes
            if (bytes.byteLength < 3) return;
            if (bytes[0] != ASCIICodes.Escape || bytes[1] != ASCIICodes.OpenSquareBracket) return;

            let byte: number;
            let rawParams: number[] = [];
            for (let i = 2; i < bytes.byteLength; i++) {
                byte = bytes[i];
                if (byte >= 0x30 && byte <= 0x3f) {
                    rawParams.push(byte);
                } else if (byte >= 0x40 && byte <= 0x7E) {
                    rawParams.push(byte);
                    break;
                } else {
                    proc.close(proc, ProcessSignal.ERROR);
                    return;
                }
            }


            if (rawParams.length == 0) {
                proc.close(proc, ProcessSignal.ERROR);
                return;
            }

            let finalByte = rawParams.pop()!;

            if (finalByte === ASCIICodes.R) {
                // ^[<v>;<h>R
                let [, horizontal] = readParams(rawParams, 0, 2);

                if (!original_cursor_position) {
                    original_cursor_position = horizontal

                    // move cursor to extreme
                    proc.io.write(CSI(0x39, 0x39, 0x39, 0x39, ASCIICodes.G));
                    proc.io.write(CSI(0x36, ASCIICodes.n));
                } else {
                    data!.width = horizontal
                    proc.io.write(CSI(...numbertonumbers(original_cursor_position), ASCIICodes.G))

                    proc.io.read = io_reader;
                    proc.device.unschedule(sched_id);
                    resolve(data);
                }

                if (io_reader) {
                    io_reader(bytes);
                }
            }

            return true;
        }

        // fix issue with some stuff
        proc.device.schedule(() => {
            // issue query for cursor position ^[6n
            proc.io.write(CSI(0x36, ASCIICodes.n));
            proc.io.flush();
        })
    })
}
