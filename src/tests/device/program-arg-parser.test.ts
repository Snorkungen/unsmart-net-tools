import { describe, expect, test } from "vitest";
import { PAP_dt_ipv4, PAP_dt_number, PAP_dt_optional, PAP_dt_union, __PAP_parse_ipv4, __PAP_parse_number, ProgramArgDefs, pap_init, pap_create_message } from "../../lib/device/internals/program-arg-parser";

describe("program tools magic", () => {

    const pap = pap_init([
        ["test", PAP_dt_ipv4("test address"), PAP_dt_number("value"), PAP_dt_optional(PAP_dt_union("name", [__PAP_parse_ipv4, __PAP_parse_number]))],
        ["help", PAP_dt_number("value")],
        ["echo"],
        ["bada", "dada"],
        ["bada", "cada"]
    ]);
    const proc: any = ""

    test("nada #0", () => {
        let res = pap(proc, ["nada"]);
        expect(res.success).be.false;
        expect(res.error).eq("UNKNOWN_VALUE")

        res = pap(proc, ["bada", "bada"]);
        expect(res.success).be.false;
        expect(res.error).eq("UNKNOWN_VALUE")
    })

    test("test #1", () => {
        let res = pap(proc, ["test"])
        expect(res.success).be.false;
        expect(res.error).eq("MISSING_VALUE")

        res = pap(proc, ["test", "192.168.1.1", "dsa"])
        expect(res.success).to.false;
        expect(res.error).eq("BAD_VALUE");

        res = pap(proc, ["test", "192.168.1.1", "1000"])
        expect(res.success).be.true;

        if (res.success) {
            let [name] = res.values;
        }

        res = pap(proc, ["test", "192.168.1.1", "1000", "22"])
        expect(res.success).be.true;
        console.log(res)

        res = pap(proc, ["test", "192.168.1.1", "1000", "192.168.1.1"])
        expect(res.success).be.true;
        if (res.success) {
            let m = res.values;
        }
    })

    test("help #2", () => {
        let res = pap(proc, ["help", "23"])
        expect(res.success).be.true
    })

    test("echo #3", () => {
        let res = pap(proc, ["echo", "d"])
        expect(res.success).be.true;
        console.log(res)
    })
})