import { IPV4Address } from "../../address/ipv4";
import { AddressMask, createMask } from "../../address/mask";
import type { Device } from "../device";
import type { BaseInterface } from "../interface";

export interface ProgramParameter<V extends unknown> {
    name: string;
    /** @throws ProgramParameterError */
    parse(this: ProgramParameter<unknown>, val: string, dev: Device): V;

    optional?: boolean;
}

/** does nothing for now just to leave a stub for future use */
export class ProgramParameterError<V = unknown> extends Error {
    constructor(param: ProgramParameter<V>) {

        super(param.name);
    }
}

export type ProgramParameters = (string | ProgramParameter<unknown>)[];

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
        problem: "MISSING" | "INVALID" | "UNKNOWN";
        /** index of argument that caused the problem */
        idx: number;
        args: string[];
        /** Paramaters that caused the problem */
        options: (string | ProgramParameter<unknown>)[];

        error?: ProgramParameterError<unknown>;
    }
);

/** class that retains the types because this one thing caused issues */
export class ProgramParameterDefinition<const T extends ProgramParameters[]> {
    definition: T;

    constructor(definition: T) {
        this.definition = definition;
    };

    parse(device: Device, args: string[]): ProgramParseResult<T> {
        let errors: ProgramParameterError[] = [];
        let options: ProgramParameters[] = [];

        let fail_matrix: (true | undefined)[] = new Array(this.definition.length),
            prev_fail_matrix: typeof fail_matrix = new Array(this.definition.length);

        let i = 0;
        for (; i < args.length; i++) {
            let arg = args[i];

            for (let j = 0; j < this.definition.length; j++) {
                let params = this.definition[j];

                if (i >= params.length || prev_fail_matrix[j]) {
                    continue
                }

                let param = params[i];
                if (typeof param == "string") {
                    if (arg != param) {
                        fail_matrix[j] = true;
                    }
                } else {
                    try {
                        param.parse(arg, device);
                    } catch (error) {
                        if (error instanceof ProgramParameterError) {
                            errors.push(error)
                        }
                        fail_matrix[j] = true;
                    }
                }
            }

            let options_left = this.definition.length - fail_matrix.filter(Boolean).length;
            if (options_left == 0) {
                if (i == 0) {
                    options = this.definition;
                    break; // special case there is nothing to roll-back
                }

                // roll-back and look at previous problems
                options = this.definition.filter((_, j) => !prev_fail_matrix[j]);
                if (options.length > 1) {
                    break; // later logic resolves this problem
                }

                return {
                    success: false,
                    problem: "INVALID",
                    idx: i,
                    args: args,
                    options: [options[0][i]],
                    error: errors.at(-1) // the last error is the one in this case
                }
            }

            // how could this be done without creating a new array
            prev_fail_matrix = fail_matrix;
            fail_matrix = [...fail_matrix];

            errors.length = 0; // reset errors
        }

        if ((args.length > 0 && i === 0) || options.length > 1) {
            let possible_values = new Array(options.length);
            for (let j = 0; j < options.length; j++) {
                possible_values[j] = options[j][i];
            }

            return {
                success: false,
                problem: "UNKNOWN",
                idx: i,
                args: args,
                options: possible_values,
            }
        }

        options = this.definition.filter((_, j) => !prev_fail_matrix[j])
            .sort((a, b) => a.length - b.length); // sort ascending

        if (options.length == 0) {
            throw new Error("unreachable");
        }

        let params = options[0];
        let last_param = params[args.length];
        if (args.length < params.length && (typeof last_param == "string" || !last_param.optional)) {
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

        if (result.problem == "MISSING") {
            let dt = result.options[0];
            if (typeof dt == "string") {
                return `keyword: "${dt}" missing`;
            }

            return `value: "${dt.name}" missing`;
        }

        if (result.problem == "INVALID") {
            let dt = result.options[0];

            if (typeof dt == "string") {
                return `keyword: expected "${dt}" received "${result.args[result.idx]}"`;
            }

            return `value: "${result.args[result.idx]}" is invalid`
        }

        if (result.problem == "UNKNOWN") {
            return `value: "${result.args[result.idx]}" unknown`
        }

        throw new Error("unreachable")
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

    static parse_number: ProgramParameter<number>["parse"] = function (val) {
        let n = parseFloat(val);
        if (isNaN(n)) {
            throw new Error();
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
            mask = createMask(IPV4Address, PPFactory.parse_number.call(this, val, dev))
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