import { uint8_concat } from "../../binary/uint8-array";
import { TCP_HEADER, TCP_OPTION_KINDS } from "../../header/tcp";
import type { Contact } from "../device";

export enum TCPState {
    CLOSED,
    LISTEN,
    SYN_RCVD,
    SYN_SENT,
    ESTABLISHED,
    FIN_WAIT_1,
    FIN_WAIT_2,
    CLOSING,
    TIME_WAIT,

    CLOSE_WAIT,
    LAST_ACK,
}

export type TCPConnection = {
    state: TCPState;
    out_data: Uint8Array[];
    in_data: Uint8Array[];


    sequence_number: number;
    ack_number: number;

    /** max window size */
    window: number;
    /** max segments size */
    mss: number;
};

export function tcp_connection_id(contact: Contact): string {
    if (!contact.address)
        return ""; // empty string
    return `${contact.address.daddr.toString()}${contact.address.saddr.toString()}${contact.address.dport}${contact.address.sport}`;
}

/** This does not feel like this is the most optimal solution, but what do i care */
export function tcp_set_option(tcphdr: typeof TCP_HEADER, kind: typeof TCP_OPTION_KINDS[keyof typeof TCP_OPTION_KINDS], data?: Uint8Array) {
    let payload = tcphdr.get("payload");

    if (kind === TCP_OPTION_KINDS.EOL || kind === TCP_OPTION_KINDS.NOP) {
        // this is a special case do nothing
        return;
    }

    let options_length = data ? 2 + data.byteLength : 2;
    let options_end = 0;
    let i = 0;

    if (tcphdr.get("doffset") <= 5) {
        /** there is a better way of doing this but my thinking is not functioning a.t.m. */
        options_end = Math.ceil(options_length / 4) << 2;
        payload = uint8_concat([
            new Uint8Array(options_end),
            payload
        ]);

        tcphdr.set("doffset", 5 + (options_end >> 2));
    } else {
        options_end = (tcphdr.get("doffset") << 2) - 20;

        // find begin
        while (i < options_end) {
            // this shit has to parse the options
            if (payload[i] === TCP_OPTION_KINDS.EOL)
                break;

            // else skip the right amount of bytes
            if ((i + 1) < options_end) {
                i += payload[i + 1];
                continue
            }

            i++;
        }

        if ((options_end - i) > options_length && payload.byteLength > options_length) {
            // there is room to set at the current index do nothing
        } else {
            // append the amount of space needed, i am now doing a lazy approach because i can't be bothered
            let word_count = Math.ceil(options_length / 4);

            payload = uint8_concat([
                payload.slice(0, options_end),
                new Uint8Array(word_count << 2),
                payload.slice(options_end)
            ]);

            tcphdr.set("doffset", tcphdr.get("doffset") + word_count);
        }
    }

    payload[i++] = kind;
    payload[i++] = options_length;
    data && payload.set(data, i)

    tcphdr.set("payload", payload);

    return tcphdr;
}

export function tcp_read_options(tcphdr: typeof TCP_HEADER): Map<number, Uint8Array> {
    const map = new Map<number, Uint8Array>();

    if (tcphdr.get("doffset") <= (5)) {
        return map;
    }

    let end = tcphdr.get("doffset") << 2;
    let i = 20;
    let kind = 0, len = 0;

    while (i < end && i < tcphdr.size) {
        kind = tcphdr.getBuffer()[i];

        if (kind == TCP_OPTION_KINDS.EOL)
            break;

        i++;

        if (kind == TCP_OPTION_KINDS.NOP)
            continue;

        len = tcphdr.getBuffer()[i];
        if (len <= 2) {
            map.set(kind, new Uint8Array())
        } else {
            map.set(
                kind,
                tcphdr.getBuffer().slice(i + 1, i + len - 1)
            )
        }

        i += len - 1;
    }

    return map;
}