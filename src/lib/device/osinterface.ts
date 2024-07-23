import { BaseAddress } from "../address/base";
import { IPV4Address } from "../address/ipv4";
import { SLICE, StructType, UINT16, UINT32, defineStruct } from "../binary/struct";
import { uint8_fromString } from "../binary/uint8-array";
import { ETHERNET_HEADER, ETHER_TYPES, EtherType } from "../header/ethernet";
import { IPV4_HEADER } from "../header/ip";
import { NetworkData, DeviceRoute, DeviceResult, Device } from "./device";
import { BaseInterface } from "./interface";

const OSIFS_VERSION = 1,
    OSIFS_OP_INIT = 1,
    OSIFS_OP_REPLY = 2,
    OSIFS_OP_FETCH_CLIENTS = 3,
    OSIFS_OP_SEND_PACKET = 8;

export const OSIFS_FRAME = defineStruct({
    version: UINT16,
    opcode: UINT16,
    clientid: UINT32,
    transactionid: UINT32,
    ethertype: <StructType<EtherType>>UINT16,
    payload: SLICE
});

/** a singleton that wraps and checks stuff and does some stateful stuff */
const OSINTERFACER = {
    url: "",
    websocket: undefined as undefined | WebSocket,
    clients: new Map<number, OSInterface>(),
    transactions: new Map<number, [opcode: number, iface: OSInterface]>(),

    connect(url: string) {
        this.url = url;
        this.websocket = new WebSocket(url);

        this.websocket.onerror = () => {
            this.websocket = undefined;
        }

        this.websocket.onclose = () => {    
            this.clients.forEach(iface => {
                iface.up = false;
            })

            // reset the state
            this.websocket = undefined;
            this.clients = new Map()
            this.transactions = new Map()
        }

        this.websocket.onopen = () => {
            console.log("osinterfacer has established a connection with a server");
        }

        // handle each received message
        this.websocket.onmessage = async (ev) => {
            let data = new Uint8Array(await ev.data.arrayBuffer());
            let frame = OSIFS_FRAME.from(data);

            if (frame.get("version") != OSIFS_VERSION) {
                return;
            }

            // handle send packet
            if (frame.get("opcode") === OSIFS_OP_SEND_PACKET) {
                let iface = this.clients.get(frame.get("clientid"));
                if (!iface) {
                    return; // ignore client unknown
                }

                return iface.input(frame.get("ethertype"), { buffer: frame.get("payload") })
            }

            if (frame.get("opcode") != OSIFS_OP_REPLY) {
                return; // ignore bad opcode
            }


            // handle replies
            let transaction = this.transactions.get(frame.get("transactionid"));
            if (!transaction) {
                return; // transaction id unknown
            }

            let [opcode, iface] = transaction;

            let options: {};
            if (frame.get("payload").length < 2) {
                options = {};
            } else {
                try {
                    let td = new TextDecoder()
                    options = JSON.parse(td.decode(frame.get("payload")))
                } catch (_) {
                    options = {}
                }
            }

            if (opcode != OSIFS_OP_INIT) {
                return; // only op being sent is INIT
            }

            iface.clientid = frame.get("clientid");
            iface.up = true;

            this.clients.set(iface.clientid, iface);
        }
    },
    send_init(iface: OSInterface) {
        if (!this.websocket) {
            return; // do nothing, server is not up
        }

        let transactionid = Math.floor(Math.random() * 10_000);

        let frame = OSIFS_FRAME.create({
            version: OSIFS_VERSION,
            opcode: OSIFS_OP_INIT,
            transactionid: transactionid,
            payload: uint8_fromString(JSON.stringify({
                // leave room for options
            }, null, 0))
        });

        this.websocket.send(frame.getBuffer())
        this.transactions.set(transactionid, [OSIFS_OP_INIT, iface])
    },
    send_packet(iface: OSInterface | undefined, ethertype: EtherType, data: NetworkData) {
        if (!this.websocket) {
            return; // websocket not connected
        }

        iface = this.clients.get(iface?.clientid || -1);
        if (!iface) {
            return; // iface is not initialized
        }

        let frame = OSIFS_FRAME.create({
            version: OSIFS_VERSION,
            opcode: OSIFS_OP_SEND_PACKET,
            clientid: iface.clientid,
            transactionid: 0,
            ethertype: ethertype,
            payload: data.buffer
        })

        this.websocket.send(frame.getBuffer());
    }
}

OSINTERFACER.connect("ws://localhost:7000");

export class OSInterface extends BaseInterface {
    clientid: number = -1

    constructor(device: Device) {
        super(device, "osif" as any,
            device.interfaces.reduce((s, { name }) => s + ((name == "eth") as unknown as number), 0),
            0xfffe,
        )

        this.header = null;
        this.up = false;
    }


    output(data: NetworkData, destination: BaseAddress, rtentry?: DeviceRoute | undefined): DeviceResult {
        if (!this.up || this.clientid < 0) {
            return { success: false, error: "", message: OSInterface.name + " must be started before sending" }
        }

        if (destination instanceof IPV4Address) {
            this.device.log({
                buffer: ETHERNET_HEADER.create({ ethertype: ETHER_TYPES.IPv4, payload: data.buffer }).getBuffer(),
                rcvif: this
            }, "SEND")
            OSINTERFACER.send_packet(this, ETHER_TYPES.IPv4, data)
        }

        return { success: true, data: undefined, error: undefined }
    }

    input(ethertype: EtherType, data: NetworkData) {
        data.rcvif = this
        data.broadcast = false
        this.device.schedule(() => {
            this.device.log({ ...data, buffer: ETHERNET_HEADER.create({ ethertype: ethertype, payload: data.buffer }).getBuffer() }, "RECEIVE")

            if (ethertype == ETHER_TYPES.IPv4) {
                this.device.input_ipv4(IPV4_HEADER.from(data.buffer), data)
            }
        })
    }

    start(): DeviceResult {
        // register a client
        OSINTERFACER.send_init(this)
        return { success: true, data: undefined, error: undefined }
    }
}