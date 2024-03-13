import { uint8_fromString } from "../../binary/uint8-array";
import { ProcessSignal, Program } from "../device";
import { formatTable } from "./helpers";

export const DEVICE_PROGRAM_DBINFO: Program = {
    name: "dbinfo",
    description: "manages information in the \"device db\”",
    content: `<dbinfo>  Lists all db information 
<ifinfo [KEY]> displays the information stored with the key
<ifinfo [KEY] [message]> set the value associated with the key
<ifinfo delete [KEY]> deletes the key from the "device database"`,
    init(proc, argv) {
        let [, key, message] = argv;

        if (!key) {
            // display all information available

            let table: string[][] = []
            for (let key of proc.device.db_keys()) {
                let m = proc.device.db_get(key); m = !m ? "''" : "'" + m + "'"
                // !TODO: remove whitespace charachters that are not space
                table.push(["\'" + key + "\':", m])
            }

            proc.term_write(formatTable(table))
            return ProcessSignal.EXIT;
        }

        if (key.toLowerCase() === "delete" && message) {
            proc.device.db_delete(message)
            return ProcessSignal.EXIT;
        }

        if (typeof message === "string") {
            proc.device.db_set(key, message);
        }


        proc.term_write(uint8_fromString(proc.device.db_get(key) || ""))

        return ProcessSignal.EXIT;
    }
}