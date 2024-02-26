import { describe, expect, test } from "vitest";
import { TCP_HEADER, TCP_OPTION_KINDS } from "../../lib/header/tcp";
import { tcp_read_options, tcp_set_option } from "../../lib/device/internals/tcp";
import { uint8_equals, uint8_fromNumber } from "../../lib/binary/uint8-array";

describe("Device tcp_set_option", () => {
    test("clean blank", () => {
        let tcphdr = TCP_HEADER.create({ payload: new Uint8Array([255, 255, 255, 255]) });
        tcp_set_option(tcphdr, TCP_OPTION_KINDS.MSS, uint8_fromNumber(10, 2));

        expect(tcphdr.get("doffset") == 6);
        expect(uint8_equals(
            tcphdr.get("payload"),
            new Uint8Array([TCP_OPTION_KINDS.MSS, 4, 0, 10, 255, 255, 255, 255])
        )).true;
    })

    test("clean blank odd", () => {
        let tcphdr = TCP_HEADER.create({ payload: new Uint8Array([255, 255, 255, 255]) });
        tcp_set_option(tcphdr, TCP_OPTION_KINDS.MSS, uint8_fromNumber(0, 3));

        expect(tcphdr.get("doffset") == 7);
        expect(uint8_equals(
            tcphdr.get("payload"),
            new Uint8Array([TCP_OPTION_KINDS.MSS, 5, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255])
        )).true;
    })

    test("add to existing", () => {
        let tcphdr = TCP_HEADER.create({ payload: new Uint8Array([255, 255, 255, 255]) });
        tcp_set_option(tcphdr, TCP_OPTION_KINDS.MSS, uint8_fromNumber(10, 2));
        tcp_set_option(tcphdr, TCP_OPTION_KINDS.WSC, uint8_fromNumber(0, 1));

        expect(tcphdr.get("doffset") == 7);
        expect(uint8_equals(
            tcphdr.get("payload"),
            new Uint8Array([TCP_OPTION_KINDS.MSS, 4, 0, 10, TCP_OPTION_KINDS.WSC, 3, 0, 0, 255, 255, 255, 255])
        )).true;
    })

    test("add to existing odd", () => {
        let tcphdr = TCP_HEADER.create({ payload: new Uint8Array([255, 255, 255, 255]) });
        tcp_set_option(tcphdr, TCP_OPTION_KINDS.MSS, uint8_fromNumber(10, 2));
        tcp_set_option(tcphdr, TCP_OPTION_KINDS.WSC, uint8_fromNumber(0, 1));
        tcp_set_option(tcphdr, TCP_OPTION_KINDS.WSC, uint8_fromNumber(0, 1));

        expect(tcphdr.get("doffset") == 8);
        expect(uint8_equals(
            tcphdr.get("payload"),
            new Uint8Array([TCP_OPTION_KINDS.MSS, 4, 0, 10, TCP_OPTION_KINDS.WSC, 3, 0, TCP_OPTION_KINDS.WSC, 3, 0, 0, 0, 255, 255, 255, 255])
        )).true;
    })
})

describe("Device tcp_read_options", () => {
    test("read single option", () => {
        let tcphdr = TCP_HEADER.create({ payload: new Uint8Array([255, 255, 255, 255]) });
        tcp_set_option(tcphdr, TCP_OPTION_KINDS.MSS, uint8_fromNumber(10, 2));
    
        let rmap = tcp_read_options(tcphdr);
    
        let v = rmap.get(TCP_OPTION_KINDS.MSS)

        expect(v).toBeTruthy()
        expect(v!.byteLength).eq(2);
        expect(v![1]).eq(10)
    })
    test("read two options", () => {
        let tcphdr = TCP_HEADER.create({ payload: new Uint8Array([255, 255, 255, 255]) });
        tcp_set_option(tcphdr, TCP_OPTION_KINDS.MSS, uint8_fromNumber(10, 2));
        tcp_set_option(tcphdr, TCP_OPTION_KINDS.MSS, uint8_fromNumber(10, 2));
        tcp_set_option(tcphdr, TCP_OPTION_KINDS.WSC, uint8_fromNumber(0, 1));
        tcp_set_option(tcphdr, TCP_OPTION_KINDS.WSC, uint8_fromNumber(8, 1)); // this is going to use the last value
    
        let rmap = tcp_read_options(tcphdr);
    
        let v = rmap.get(TCP_OPTION_KINDS.WSC)

        expect(v).toBeTruthy()
        expect(v!.byteLength).eq(1);
        expect(v![0]).eq(8)
    })
})