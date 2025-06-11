import { describe, expect, test } from "vitest";
import { ProgramParameterDefinition, PPFactory } from "../../lib/device/internals/program-parameters";

describe("ProgramParameterDefinition", () => {
    const pdef = new ProgramParameterDefinition([
        ["test", PPFactory.ipv4("test address"), PPFactory.number("value"), PPFactory.optional(PPFactory.union("name", [PPFactory.parse_ipv4, PPFactory.parse_number]))],
        ["help", PPFactory.number("value")],
        ["echo"],
        ["bada", "dada"],
        ["bada", "cada"],
        ["issue1"],
        ["issue1", "keyword"],
        ["issue1", "keyword", "2"],
        ["issue1", "keyword", "1"],
        ["issue1", PPFactory.optional(PPFactory.keywords("optional", ["optional"]))],
    ])

    const device: any = ""

    test("nada #0", () => {
        let res = pdef.parse(device, ["nada"]);
        expect(res.success).be.false;
        expect(res.problem).eq("UNKNOWN")
        if (!res.success) {
            expect(res.idx).eq(0)
        }

        res = pdef.parse(device, ["bada", "bada"]);
        expect(res.success).be.false;
        expect(res.problem).eq("UNKNOWN")
        if (!res.success) {
            expect(res.idx).eq(1)
        }

        res = pdef.parse(device, ["bada"]);
        expect(res.success).be.false;
        expect(res.problem).eq("MISSING_UNKNOWN")
        if (!res.success) {
            expect(res.idx).eq(1)
        }
    })

    test("test #1", () => {
        let res = pdef.parse(device, ["test"])
        expect(res.success).be.false;
        expect(res.problem).eq("MISSING")
        if (!res.success) {
            expect(res.idx).eq(1)
        }

        res = pdef.parse(device, ["test", "192.168.1.1", "dsa"])
        expect(res.success).to.false;
        expect(res.problem).eq("INVALID");
        if (!res.success) {
            expect(res.idx).eq(2)
        }


        res = pdef.parse(device, ["test", "192.168.1.1", "1000"])
        expect(res.success).be.true;

        if (res.success) {
            let [name] = res.arguments;
        }

        res = pdef.parse(device, ["test", "192.168.1.1", "1000", "22"])
        expect(res.success).be.true;

        res = pdef.parse(device, ["test", "192.168.1.1", "1000", "22.2.2.1"])
        expect(res.success).be.true;

        res = pdef.parse(device, ["test", "192.168.1.1", "1000", "192.168.1.1"])
        expect(res.success).be.true;
        if (res.success && res.arguments[0] == "test") {
            let m = res.arguments;

        }
    })

    test("help #2", () => {
        let res = pdef.parse(device, ["help", "23"])
        expect(res.success).be.true
    })

    test("echo #3", () => {
        let res = pdef.parse(device, ["echo", "d"])
        expect(res.success).be.true;
    })

    test("issue1 #4", () => {
        var res = pdef.parse(device, ["issue1", "bad_keyword"]);
        expect(res.success).be.false;
        expect(res.problem).eq("INVALID")

        var res = pdef.parse(device, ["issue1"])
        expect(res.success).be.true;

        res = pdef.parse(device, ["issue1", "keyword"])
        expect(res.success).be.true;

        res = pdef.parse(device, ["issue1", "keyword", "3"])
        expect(res.success).be.false;
        expect(res.problem).eq("UNKNOWN")
        console.log(res)
    })
})