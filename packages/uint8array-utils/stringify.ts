export type Encoding = string;


export function stringify(buf: Uint8Array, encoding?: Encoding): string {



    return toHex(buf);
}

function toHex(buf: Uint8Array): string {
    let str = "";

    for (let i = 0; i < buf.byteLength; i++) {
        str += buf[i]
            .toString(16).padEnd(2, "0")
    }

    return str;
}