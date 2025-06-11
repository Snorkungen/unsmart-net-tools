import { IPV4Address } from "../../address/ipv4";
import { AddressMask, createMask } from "../../address/mask";
import type { Device } from "../device";
import type { BaseInterface } from "../interface";

export interface ProgramParameter<V extends unknown> {
    name: string;
    /** @throws ProgramParameterError */
    parse(this: ProgramParameter<unknown>, val: string, dev: Device): V;

    multiple?: boolean;
    optional?: boolean;
    keywords?: string[];
}

/** does nothing for now just to leave a stub for future use */
export class ProgramParameterError<V = unknown> extends Error {
    constructor(param: ProgramParameter<V>) {

        super(param.name);
    }
}

export type ProgramParameters = (string | ProgramParameter<unknown>)[] & Partial<{
    // metadata
    description?: string
}>;

type ConvertProgramParameters<F, T> = {
    [K in keyof F]: F[K] extends { parse: infer U } ? U extends ProgramParameter<T>["parse"] ? ReturnType<U> : never : F[K];
};

export type ProgramArguments<T> = ConvertProgramParameters<T[Exclude<keyof T, keyof []>], unknown>;

export type ProgramParseResult<T> = (
    {
        success: true;
        arguments: ProgramArguments<T>;
        problem?: undefined;
    } |
    {
        success: false;
        problem: "MISSING" | "INVALID" | "UNKNOWN" | "MISSING_UNKNOWN";
        /** index of argument that caused the problem */
        idx: number;
        args: string[];
        /** Parameters that caused the problem */
        options: (string | ProgramParameter<unknown>)[];
    }
);

/** class that retains the types because this one thing caused issues */
export class ProgramParameterDefinition<const T extends ProgramParameters[]> {
    definition: T;

    constructor(definition: T) {
        this.definition = definition;
    };

    private errors: ProgramParameterError[] = [];
    private parse_test(device: Device, arg: string, param: string | ProgramParameter<unknown>): undefined | true {
        if (typeof param == "string") {
            if (arg != param) {
                // !TODO: keyword error something ...
                return true;
            }
        } else {
            try {
                param.parse(arg, device);
            } catch (error) {
                if (error instanceof ProgramParameterError) {
                    this.errors.push(error)
                }
                return true;
            }
        }

        return undefined;
    }
    parse(device: Device, args: string[]): ProgramParseResult<T> {
        let options: ProgramParameters[] = [];

        // create a stack of fail matrices, and when fail walk back until there is a good one
        // and then do some logic

        let fail_matrices: (true | undefined)[][] = [
            new Array(this.definition.length),
        ]

        let prev_fail_matrix = fail_matrices[0];
        let fail_matrix = fail_matrices[0];

        let i = 0;
        for (; i < args.length; i++) {
            for (let j = 0; j < this.definition.length; j++) {
                let params = this.definition[j];
                if (i == params.length || prev_fail_matrix[j]) {
                    continue
                }
                if (i > params.length) {
                    fail_matrix[j] = true
                }

                fail_matrix[j] = this.parse_test(device, args[i], params[i]);
            }

            // add a check everywher we fail if the issue is we got's to many params
            let options_left = this.definition.length - fail_matrix.filter(Boolean).length;
            if (options_left == 0) {
                if (i == 0) {
                    options = this.definition;
                    break; // special case there is nothing to roll-back
                }
                // roll-back and look at previous problems
                options = this.definition.filter((params, j) => !prev_fail_matrix[j] && params.length >= i);
                if (options.length > 1) {
                    break; // later logic resolves this problem
                } else if (options.length == 1) {
                    return {
                        success: false,
                        problem: "INVALID",
                        idx: i,
                        args: args,
                        options: [options[0][i]],
                    }
                }
            }

            prev_fail_matrix = fail_matrices.at(-1)!;
            if (i + 1 === args.length) {
                continue;
            }

            fail_matrices.push([...fail_matrix]);
            fail_matrix = fail_matrices.at(-1)!
        }

        // if there are longer matches remove the shorter ones
        let filter_shorter = false;
        for (let j = 0; j < this.definition.length; j++) {
            if (fail_matrix[j]) continue;
            if (this.definition[j].length <= i) continue;
            filter_shorter = true
            break;
        }
        if (filter_shorter) {
            for (let j = 0; j < this.definition.length; j++) {
                if (fail_matrix[j] || this.definition[j].length >= i) continue;
                fail_matrix[j] = true;
            }
        }


        // walk back fail matrixes until something is found, until a matrix with values is found
        while (i > 1 && !fail_matrices[i - 1].includes(undefined)) { i--; }
        fail_matrix = fail_matrices[i - 1]

        // there is this edge-case that I want to check
        // find the parameter thats left and check it's length 
        if (i > 0) {
            const k = fail_matrix.reduce((best, v, j) => (
                v ? best : best > this.definition[j].length ? best : this.definition[j].length
            ), -1);

            if (k > 0 && k < i) {
                let test_options = this.definition.filter((parameters, j) => {
                    if (parameters.length <= k) return false;
                    if (fail_matrices[k - 1][j]) return false;
                    if (typeof parameters[k] != "string" && parameters[k].optional) return false;
                    // set an uniqueness filter, and avoid copies
                    let found = false;
                    for (let l = j - 1; !found && l >= 0; l--) {
                        if (fail_matrices[k - 1][l]) continue;
                        found = this.definition[l][k] === parameters[k]
                    }
                    if (found) return false;

                    return true
                });

                if (test_options.length === 1) {
                    return {
                        success: false,
                        problem: "INVALID",
                        idx: k,
                        args: args,
                        options: [test_options[0][i]],
                    }
                } else if (test_options.length > 1) {
                    i = k;
                    options = test_options;
                }
            }
        }

        if ((args.length > 0 && i === 0) || options.length > 1) {
            let possible_values = new Array(options.length).fill(0).map((_, j) => options[j][i]);
            return {
                success: false,
                problem: "UNKNOWN",
                idx: i,
                args: args,
                options: possible_values,
            }
        }

        options = this.definition.filter((_, j) => !fail_matrix[j])
            .sort((a, b) => a.length - b.length); // sort ascending

        if (options.length == 0) {
            throw new Error("unreachable");
        }

        let params = options[0];
        let last_param = params[args.length];
        if (args.length < params.length && (typeof last_param == "string" || !last_param.optional)) {
            if (options.length > 0) {
                let possible_values = new Array(options.length).fill(0).map((_, j) => options[j][i]);

                // check that the posible values are all the same
                if (!possible_values.every((v) => v === possible_values[0])) {
                    return {
                        success: false,
                        problem: "MISSING_UNKNOWN",
                        idx: i,
                        args: args,
                        options: possible_values,
                    }
                }
            }

            return {
                success: false,
                problem: "MISSING",
                idx: args.length,
                args: args,
                options: [params[args.length]],
            }
        }

        // successfully parse out arguements
        let result = args as any;
        for (let i = 0; i < (Math.min(args.length, params.length)); i++) {
            let param = params[i];

            if (typeof param == "string") {
                result[i] = param;
            } else if (param.multiple) {
                let vals = [];
                for (let j = i; j < args.length; j++) {
                    try {
                        let v = param.parse(args[j], device);
                        vals.push(v)
                    } catch (error) {
                        // !TODO: Consider returning an error, if failed to parse a value
                    }
                }
                result[i] = vals;
                break;
            } else {
                result[i] = param.parse(args[i], device);
            }
        }

        return {
            success: true,
            arguments: result as ProgramArguments<T>
        }
    }

    message(result: ProgramParseResult<T>): string {
        if (result.success) {
            return "All args parsed successfully";
        }

        if (result.problem == "MISSING" || result.problem == "MISSING_UNKNOWN") {
            if (result.options.length > 1) {
                return "value: missing"
            }

            let param = result.options[0];
            if (typeof param == "string") {
                return `keyword: "${param}" missing`;
            }

            return `value: "${param.name}" missing`;
        }

        if (result.problem == "INVALID") {
            let param = result.options[0];

            if (typeof param == "string") {
                return `keyword: expected "${param}" received "${result.args[result.idx]}"`;
            }

            if (param.keywords) {
                return `keyword: expeted (${param.keywords.join(" | ")}) received "${result.args[result.idx]}"`;
            }

            return `value: "${result.args[result.idx]}" is invalid`
        }

        if (result.problem == "UNKNOWN") {
            return `value: "${result.args[result.idx]}" unknown`
        }

        throw new Error("unreachable")
    }

    content(): [string, string | undefined][] {
        let result = new Array<[string, string | undefined]>(this.definition.length);

        for (let j = 0; j < this.definition.length; j++) {
            let parameters = this.definition[j];
            result[j] = ["", undefined];
            result[j][0] = parameters.map((param) => {
                if (typeof param == "string") {
                    return param;
                }
                let sb = "["
                if (param.multiple) {
                    sb += "..."
                }
                if (param.optional) {
                    sb += "?";
                }
                if (param.keywords) {
                    if (param.keywords.length > 1) sb += "("
                    sb += `${param.keywords.map(v => '"' + v + '"').join(" | ")}`
                    if (param.keywords.length > 1) sb += ")"
                } else {
                    sb += param.name
                }

                sb += "]"

                return sb;
            }).join(" ");

            result[j][1] = parameters.description;
        }

        return result;
    }

}


class ProgramParameterFactory /** PPFactory 😂 */ {

    static create<T>(name: string, parse: ProgramParameter<T>["parse"]): ProgramParameter<T> {
        return {
            name: name,
            parse: parse
        }
    }

    static union<V extends unknown, T extends ProgramParameter<V>["parse"]>(name: string, parsers: T[]): ProgramParameter<ReturnType<T>> {
        return {
            name: name,
            parse(...args): ReturnType<T> {
                let errors: ProgramParameterError[] = [];
                for (let parse of parsers) {
                    try {
                        let v = parse.call(this, ...args);
                        return v as ReturnType<T>;
                    } catch (error) {
                        if (error instanceof ProgramParameterError) {
                            errors.push(error);
                        }
                    }

                }

                throw new ProgramParameterError(this, /* !TODO: do something with the collected errors */)
            },
        }
    }

    static optional<T>(param: ProgramParameter<T>): ProgramParameter<T | undefined> {
        return {
            ...param,
            optional: true
        };
    }

    static keywords<const T extends string>(name: string, words: T[]): ProgramParameter<T> {
        return {
            name: name,
            parse(val) {
                if (this.keywords && this.keywords.includes(val as T)) {
                    return val as T;
                }

                throw new ProgramParameterError(this);
            },
            keywords: words
        }
    }

    static parse_value: ProgramParameter<string>["parse"] = function (val) { return val; }
    static value(name: string): ProgramParameter<string> {
        return ProgramParameterFactory.create(name, ProgramParameterFactory.parse_value);
    }

    static multiple<T>(param: ProgramParameter<T>): ProgramParameter<T[]> {
        return {
            ...param,
            multiple: true,
            // how does this work
            parse: param.parse as unknown as ProgramParameter<T[]>["parse"]
        }
    }

    static parse_number: ProgramParameter<number>["parse"] = function (val) {
        let n = parseFloat(val);
        if (isNaN(n)) {
            throw new ProgramParameterError(this);
        }
        return n;
    }

    static parse_ipv4: ProgramParameter<IPV4Address>["parse"] = function (val) {
        if (!IPV4Address.validate(val)) {
            throw new Error("")
        }
        return new IPV4Address(val)
    }

    static parse_amask_ip4: ProgramParameter<AddressMask<typeof IPV4Address>>["parse"] = function (val, dev) {
        let mask: AddressMask<typeof IPV4Address> | undefined = undefined
        try {
            mask = createMask(IPV4Address, PPFactory.parse_ipv4.call(this, val, dev));
        } catch (error) {

        }

        try {
            if (!val.includes(".")) {
                mask = createMask(IPV4Address, PPFactory.parse_number.call(this, val, dev))
            }
        } catch (error) {

        }

        if (mask && mask.isValid()) {
            return mask;
        }

        throw new ProgramParameterError(this);
    }

    static parse_baseiface: ProgramParameter<BaseInterface>["parse"] = function (ifid, device) {
        let iface = device.interfaces.find(iface => iface.id() == ifid);
        if (!iface) {
            throw new ProgramParameterError(this);
        }

        return iface;
    }

    static number(name: string) {
        return ProgramParameterFactory.create(name, ProgramParameterFactory.parse_number);
    }

    static ipv4(name: string) {

        return ProgramParameterFactory.create(name, ProgramParameterFactory.parse_ipv4);
    }
}

export const PPFactory = ProgramParameterFactory;

export function ppbind<const T extends ProgramParameters>(parameters: T, description?: string): T {
    return Object.assign(parameters, {
        description: description
    })
}