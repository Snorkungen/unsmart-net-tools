import { DHCP_MAGIC_COOKIE, DHCP_OPTION } from "./dhcp";
import { DHCP_TAGS } from "./tags";

export type DHCPParsedOptions = (typeof DHCP_OPTION)[];

export function parseDHCPOptions(options: ReturnType<typeof DHCP_OPTION["types"]["data"]["getter"]>): DHCPParsedOptions {
    let p = 0;
    
    // first read magic cookie
    for (p; p < DHCP_MAGIC_COOKIE.length; p++) {
        if (
            options[p] != DHCP_MAGIC_COOKIE[p]
        ) {
            console.warn("DHCP Magic Cookie not recognized");
            return [];
        }
    }

    let parsedOptions: DHCPParsedOptions = [];

    while (p < options.length) {
        if (options[p] == DHCP_TAGS.PAD) {
            p++;
            continue;
        } else if (options[p] == DHCP_TAGS.END) {
            break;
        }


        let tag = options[p],
            len = options[++p],
            data = options.subarray(++p, p + len)
        p += len;

        parsedOptions.push(DHCP_OPTION.create({
            tag,
            len,
            data
        }));

    }

    return parsedOptions;
}