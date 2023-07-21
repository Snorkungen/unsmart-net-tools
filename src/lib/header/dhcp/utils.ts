import { DHCPParsedOptions } from "./parse-options";
import { DHCP_TAGS } from "./tags";

export function createDHCPOptionsMap(opts: DHCPParsedOptions) {
    let map = new Map<typeof DHCP_TAGS[keyof typeof DHCP_TAGS], Buffer>();

    for (let opt of opts) {
        map.set(opt.get("tag"), opt.get("data"));
    }

    return map;
}