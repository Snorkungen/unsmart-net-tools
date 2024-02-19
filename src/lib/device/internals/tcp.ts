import type { Contact, ContactAF } from "../device";

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
    in_data:  Uint8Array[];

    sequence_number: number;
};

export function tcp_connection_id(contact: Contact): string  {
    if (!contact.address)
        return ""; // empty string
    return `${contact.address.daddr.toString()}${contact.address.saddr.toString()}${contact.address.dport}${contact.address.sport}`;
}