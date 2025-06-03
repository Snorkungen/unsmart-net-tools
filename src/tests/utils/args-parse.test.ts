import { describe, expect, test } from "vitest";
import { args_parse } from "../../lib/utils/args-parse";

describe("args parser", () => {
    test("parser", () => {
        expect(args_parse("hello, world")).toStrictEqual(["hello,", "world"])
        expect(args_parse("hello\t, world")).toStrictEqual(["hello", ",", "world"])
        expect(args_parse("'hello, world'")).toStrictEqual(["hello, world"])
        expect(args_parse('"hello, world"')).toStrictEqual(["hello, world"])
        expect(args_parse('test "hello, world" [:3]')).toStrictEqual(["test", "hello, world", "[:3]"])
        expect(args_parse('test help"me')).toStrictEqual(["test", "help", "me"])
        expect(args_parse('"\\"" "\\\\"')).toStrictEqual(['"', '\\\\'])
    })
})