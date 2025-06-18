import { ASCIICodes, CSI, numbertonumbers, readParams } from "../../terminal/shared";
import { Process, ProcessSignal, Program } from "../device";

export type TermQuery = Partial<{
    width: number;

    /** cursor vertical */
    cv: number;
    /** cursor horizontal */
    ch: number;
}>;

const MAX_QUERY_WAIT = 3;

/**
 * Query the connected terminal for information and stuff ...
 */
export function termquery(proc: Process): Promise<TermQuery> {
    const data: TermQuery = {};

    return new Promise((resolve) => {
        function quit() {
            proc.io.reader_remove(termquery_reader)
            max_timer.close();
            resolve(data);
        }

        let max_timer = proc.resources.create(
            proc.device.schedule(quit, MAX_QUERY_WAIT)
        );

        const termquery_reader = (bytes: Uint8Array) => {
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
                    proc.close(ProcessSignal.ERROR);
                    return;
                }
            }

            if (rawParams.length == 0) {
                proc.close(ProcessSignal.ERROR);
                return;
            }

            let finalByte = rawParams.pop()!;

            if (finalByte === ASCIICodes.R) {
                // ^[<v>;<h>R
                let [vertical, horizontal] = readParams(rawParams, 0, 2);

                if (!data.ch) {
                    data.cv = vertical;
                    data.ch = horizontal;

                    // move cursor to extreme
                    proc.io.write(CSI(0x39, 0x39, 0x39, 0x39, ASCIICodes.G));
                    proc.io.write(CSI(0x36, ASCIICodes.n));
                    proc.io.flush()
                } else {
                    data!.width = horizontal
                    proc.io.write(CSI(...numbertonumbers(data.ch), ASCIICodes.G))

                    quit();
                }
            }
        }

        proc.io.reader_add(termquery_reader);

        // fix issue with some stuff
        proc.resources.create(
            proc.device.schedule(() => {
                // issue query for cursor position ^[6n
                proc.io.write(CSI(0x36, ASCIICodes.n));
                proc.io.flush();
            })
        );
    })
}
