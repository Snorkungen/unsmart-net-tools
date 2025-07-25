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
    keyword?: boolean;
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
    definition: ProgramParameters[];

    constructor(definition: T) {
        this.definition = definition;
    };

    private error?: ProgramParameterError;
    /** @returns a boolean where true means it succeeded */
    test(device: Device, param: ProgramParameters[number], arg: string): boolean {
        if (typeof param == "string") {
            // !TODO: consider this being some kind of keyword error or something
            return arg == param;
        } else {
            try {
                param.parse(arg, device);
            } catch (error) {
                if (error instanceof ProgramParameterError) {
                    this.error = error;
                }
                return false;
            }

            return true;
        }
    }

    parse(device: Device, args: string[]): ProgramParseResult<T> {
        const passed = new Array<number>(this.definition.length).fill(0);
        let matches = 0;

        let i = 0;
        for (; i < args.length; i++) {
            matches = 0;

            for (let j = 0; j < this.definition.length; j++) {
                let params = this.definition[j];

                if (params.length < i || passed[j] < i) {
                    continue
                } else if (this.test(device, params[i], args[i])) {
                    passed[j] += 1;
                    matches += 1;
                }
            }

            if (matches === 0) {
                break;
            }
        }

        let options = (i == 0 ? this.definition : this.definition.filter((_, j) => passed[j] >= i))
            .sort((a, b) => a.length - b.length); // sort ascending

        // if there are longer matches remove the shorter ones
        let max_param_len = options.reduce((best, opt) => best > opt.length ? best : opt.length, -1);
        if (i < max_param_len && options.length > 1) {
            options = options.filter((opt) => opt.length >= Math.min(args.length, (i + 2)))
        }

        let shortest_parameters = options[0];
        if ((i < args.length && i < shortest_parameters.length)) {
            let k = i;
            let unique_problem_options = Array.from(new Set(new Array(options.length).fill(0).map((_, j) => options[j][k])))
            if (unique_problem_options.length > 1) {
                return {
                    success: false,
                    problem: "UNKNOWN",
                    idx: k,
                    args: args,
                    options: unique_problem_options
                }
            }

            return {
                success: false,
                problem: "INVALID",
                idx: k,
                args: args,
                options: unique_problem_options
            }
        }

        const find_optional_predicate = (params: ProgramParameters) => {
            let param = params[i];
            return typeof param != "string" && param.optional
        }

        if (args.length < shortest_parameters.length && !options.some(find_optional_predicate)) {
            let k = args.length;
            let unique_problem_options = Array.from(new Set(new Array(options.length).fill(0).map((_, j) => options[j][k])))
            if (options.length > 1) {
                return {
                    success: false,
                    problem: "MISSING_UNKNOWN",
                    idx: k,
                    args: args,
                    options: unique_problem_options
                }
            }

            return {
                success: false,
                problem: "MISSING",
                idx: k,
                args: args,
                options: unique_problem_options
            }
        }

        // successfully parse out arguements
        let result = args as any;
        for (let i = 0; i < (Math.min(args.length, shortest_parameters.length)); i++) {
            let param = shortest_parameters[i];

            if (typeof param == "string") {
                result[i] = param;
            } else if (param.multiple) {
                let vals = [];
                for (let j = i; j < args.length; j++) {
                    try {
                        vals.push(
                            param.parse(args[j], device)
                        )
                    } catch (error) { /* !TODO: Consider returning an error, if failed to parse a value */ }
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
            } else if (param.keyword) {
                return `keyword: "${param.name}" missing`;
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
            } else if (param.keyword) {
                return `keyword: expeted "${param.name}" received "${result.args[result.idx]}"`;
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
                let sb = "";
                if (param.multiple) {
                    sb += "..."
                }
                if (param.optional) {
                    sb += "?";
                }
                sb += "["

                if (param.keywords) {
                    if (param.optional && param.keywords.length > 1) sb += "("
                    sb += `${param.keywords.map(v => '"' + v + '"').join(" | ")}`
                    if (param.optional && param.keywords.length > 1) sb += ")"
                } else if (param.keyword) {
                    sb += "\"" + param.name + "\""
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

    static parse_keywords<T extends string>(this: ProgramParameter<T>, val: string): T {
        if (this.keywords && this.keywords.includes(val as T)) {
            return val as T;
        }

        throw new ProgramParameterError(this);
    }
    static keywords<const T extends string>(name: string, words: T[]): ProgramParameter<T> {
        return {
            name: name,
            parse: ProgramParameterFactory.parse_keywords<T>,
            keywords: words
        }
    }

    static parse_keyword<T extends string>(this: ProgramParameter<T>, val: string): T {
        if (val != this.name) {
            throw new ProgramParameterError(this);
        }
        return this.name as T;
    }
    static keyword<const T extends string>(word: T): ProgramParameter<T> {
        return {
            name: word,
            parse: ProgramParameterFactory.parse_keyword<T>,
            keyword: true,
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