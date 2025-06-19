// Parse the arguments

export function args_parse_ext(input: string, cursor: number = input.length): { args: string[], active: number } {
    const args: string[] = [];
    let active = -1;

    if (input.length < 1) {
        return { args, active };
    }

    let start = 0, end = 0;
    let quote: undefined | '"' | "'" = undefined;
    let c: string;

    let state = 0;
    let escape_level = 0;

    while (end < input.length) {
        c = input[end];
        if (c == "'" || c == '"') {
            if (state == 0 && end > start) {
                if (active < 0 && cursor > start && cursor <= end) {
                    active = args.length;
                };
                args.push(input.substring(start, end))
            }

            state = 0;
            quote = c;
            end++;
            start = end;
            escape_level = 0;
            while (end < input.length) {
                c = input[end]

                if (c == '\\') {
                    escape_level += 1;
                } else if (c == quote && (escape_level & 1) == 0) {
                    if (state === 0) {
                        if (active < 0 && cursor > start && cursor <= end) {
                            active = args.length;
                        };
                        args.push(input.substring(start, end))

                        start = end + 1;
                        state = 1;
                    }
                    break
                } else if (escape_level) {
                    // modify string input string
                    input = input.substring(0, end - escape_level) + input.substring(end);
                    escape_level = 0;
                    end -= escape_level
                    continue
                }

                end++;
            }
        } else if (c == " " || c == "\t" || c == "\n") {
            if (state === 0) {
                if (active < 0 && cursor > start && cursor <= end) {
                    active = args.length;
                };
                args.push(input.substring(start, end))
                start = end;
                state = 1;
            }
        } else if (state != 0) {
            state = 0;
            start = end;
        }

        end++;
    }

    if (state == 0 && end - start > 0) {
        if (active < 0 && cursor > start && cursor <= end) {
            active = args.length;
        };
        args.push(input.substring(start, end))
    }

    return { args, active };
}

export function args_parse(input: string) {
    return args_parse_ext(input).args;
}