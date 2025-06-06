/* DAEMAN MANAGER */

/* Maybe move away from daemon terminology due to them just being headless programs ... */

/* Should this program be called procman or daemon,
    because this thing manages daemons ... 
    but there is no way to during runtime to determine if a program is a daemon other than the name being dameon_*
    but that should only be for the human readability purposes */

import { uint8_fromString } from "../../binary/uint8-array";
import { Process, ProcessSignal, Program } from "../device";

/* Rev 1. list all the running programs */

export const DEVICE_PROGRAM_DAEMAN: Program = {
    name: "daeman",
    init: function (proc: Process<any>, args: string[], data?: Partial<any> | undefined): ProcessSignal {
        let i = 0;
        /* write out line-by-line each process */
        for (let p of proc.device.processes.items) {
            if (!p?.id || p == proc) continue;

            // @ts-expect-error
            let jentries = proc.device.process_journal_entries.get(p.id);
            if (jentries) {
                console.log(p.id, jentries)
            }

            proc.io.write(uint8_fromString(`${i++}:\t${p.id}\t${p.status}\n`));
        }


        return ProcessSignal.EXIT;
    },
    __NODATA__: true
};
