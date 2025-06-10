import { IPV4Address } from "../../address/ipv4";
import type { Device } from "../device";

export type ProgramArgDT<V = unknown> = {
    /** This thing should throw if it fails */
    parse(val: string, dev: Device): V
    optional?: boolean;
    name: string;
}
export type ProgramArgDefs = (string | ProgramArgDT)[];

type Convert<F> = {
    [K in keyof F]: F[K] extends { parse: infer U } ? U extends ProgramArgDT["parse"] ? ReturnType<U> : never : F[K];
};

type ProgramArgValues<T> = Convert<T[Exclude<keyof T, keyof []>]>

// TEMP NAME IS MAGIC
type ProgramArgResult<T> = {
    values: ProgramArgValues<T>
    success: true
    error?: undefined
} | {
    success: false;
    error: "MISSING_VALUE" | "BAD_VALUE" | "UNKNOWN_VALUE";
    arg_idx: number;
    options: (string | ProgramArgDT)[];
}

export function pap_create_message<T extends unknown>(args: string[], result: ProgramArgResult<T>): string {
    if (result.success) {
        return "All args parsed successfully";
    }

    if (result.error == "MISSING_VALUE") {
        let dt = result.options[0];
        if (typeof dt == "string") {
            return `keyword: "${dt}" missing`;
        }

        return `value: "${dt.name}" missing`;
    }

    if (result.error == "BAD_VALUE") {
        let dt = result.options[0];

        if (typeof dt == "string") {
            return `keyword: expected "${dt}" received "${args[result.arg_idx]}"`;
        }

        return `value: "${args[result.arg_idx]}" is invalid`
    }

    if (result.error == "UNKNOWN_VALUE") {
        return `value: "${args[result.arg_idx]}" unknown`
    }

    throw new Error("not implemented")
}

export function pap_init<const T extends ProgramArgDefs[]>(defs: T): (device: Device, args: string[]) => ProgramArgResult<T> {
    return (dev, args) => {
        return program_args_parse<T>(dev, args, defs);
    }
}

function program_args_parse<const T extends ProgramArgDefs[]>(device: Device, args: string[], defs: T): ProgramArgResult<T> {
    let options: ProgramArgDefs[] = [];
    // keep track of the previous generations fail_matrix
    let fail_matrix: Record<number, boolean> = {}
    let prev_fail_matrix: typeof fail_matrix = {};

    let i = 0
    for (; i < args.length; i++) {
        let arg = args[i];

        for (let j = 0; j < defs.length; j++) {
            let definition = defs[j]

            if (i >= definition.length || prev_fail_matrix[j]) {
                continue;
            }

            let dt = definition[i];
            if (typeof dt == "string") {
                if (arg != dt) {
                    fail_matrix[j] = true;
                }
            } else {
                try {
                    dt.parse(arg, device);
                } catch (_) {
                    fail_matrix[j] = true;
                }
            }
        }

        // check using the fail matrix how many options left
        let options_left = defs.length - Object.values(fail_matrix).length;
        if (options_left == 0) {
            if (i == 0) {
                options = defs;
                break; // special case nothing ever matched
            }

            // roll back and look at the previous thing
            options = defs.filter((_, j) => !prev_fail_matrix[j])
            if (options.length != 1) {
                break; // later logic deals with the error of multiple options
            }

            return {
                success: false,
                error: "BAD_VALUE",
                arg_idx: i,
                options: [options[0][i]]
            }
        }

        prev_fail_matrix = fail_matrix;
        fail_matrix = { ...fail_matrix }
    }

    if ((args.length > 0 && i == 0) || options.length > 1) {
        let error_possible_values = new Array(options.length);
        options.forEach((dts, j) => error_possible_values[j] = dts[i]);
        return {
            success: false,
            error: "UNKNOWN_VALUE",
            arg_idx: i,
            options: error_possible_values
        }
    }

    options = defs.filter((_, j) => !prev_fail_matrix[j]).sort((a, b) => a.length - b.length); // use the shortest
    if (options.length == 0) {
        throw new Error("Unreachable")
    }

    // check that the option has all the values
    let option = options[0];
    let last_dt = option[args.length]
    if (args.length < option.length && (typeof last_dt == "string" || !last_dt.optional)) {
        return {
            success: false,
            error: "MISSING_VALUE",
            arg_idx: args.length,
            options: [option[args.length]]
        }
    }

    // successfully parse out a result
    let result = args as any;
    for (let i = 0; i < Math.min(args.length, option.length); i++) {
        let dt = option[i];

        if (typeof dt == "string") {
            result[i] = args[i];
        } else {
            result[i] = dt.parse(args[i], device);
        }
    }

    return {
        success: true,
        values: result as ProgramArgValues<T>
    }
}

///
/// 
/// HERE BELOW GOES STANDARD DTVaulues
///
///


export function __PAP_parse_number(val: string): number {
    let n = parseFloat(val);
    if (isNaN(n)) {
        throw new Error();
    }
    return n;
}

export function PAP_dt_number(name: string): ProgramArgDT<number> {
    return {
        name: name,
        parse: __PAP_parse_number
    }
}

export function __PAP_parse_ipv4(val: string): IPV4Address {
    if (!IPV4Address.validate(val)) {
        throw new Error("")
    }
    return new IPV4Address(val)
}

export function PAP_dt_ipv4(name: string): ProgramArgDT<IPV4Address> {
    return {
        name: name,
        parse: __PAP_parse_ipv4
    }
}

export function PAP_dt_union<T extends (ProgramArgDT["parse"])>(name: string, parsers: T[]): ProgramArgDT<ReturnType<T>> {
    return {
        name: name,
        parse(...params) {
            for (let parser of parsers) {
                try {
                    let v = parser(...params) as ReturnType<T>
                    return v;
                } catch (error) {
                    // ignore error
                }

            }
            throw new Error();
        }
    }
}

export function PAP_dt_optional<T>(dt: ProgramArgDT<T>): ProgramArgDT<undefined | T> {
    dt.optional = true;
    return dt
}

let magic = pap_init([
    ["test", PAP_dt_ipv4("test address"), PAP_dt_number("value"), PAP_dt_optional(PAP_dt_union("name", [__PAP_parse_ipv4, __PAP_parse_number]))],
    ["help", PAP_dt_number("value")],
    ["echo"],
    ["bada", "dada"],
    ["bada", "cada"]
]);

let f = magic("" as any, [""])
if (f.success) {
    let m = f.values
    if (m[0] == "test") {
        let [v1, v2, v3, v4] = m;

    }
}