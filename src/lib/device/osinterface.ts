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


let transactions: { opcode: number, clid: number, xid: number, iface: OSInterface }[] = []
let websocket = new WebSocket(
    "ws://localhost:7000"
)

websocket.onopen = () => {
    console.log("WebSocket connection established")
}

websocket.onmessage = async (event) => {
    let buffer = new Uint8Array(await event.data.arrayBuffer())

    let frame = OSIFS_FRAME.from(buffer);

    // get transaction using transactionid
    let transaction = transactions.find(({ xid }) => xid === frame.get("transactionid"));

    if (!transaction) {
        return
    }

    if (frame.get("opcode") == OSIFS_OP_REPLY) {
        // parse options
        let payload = frame.get("payload");
        let options: Record<string, any>
        if (payload.length < 2) {
            options = {}
        } else {
            try {
                let td = new TextDecoder()
                options = JSON.parse(td.decode(payload))
            } catch (_) {
                options = {}
            }
        }

        // just save clientid and move on
        if (transaction.opcode != OSIFS_OP_INIT) {
            return // future versions might do something else
        }

        // !TODO: in future server might advertise supported protocols

        transaction.iface.clientid = frame.get("clientid");
        transaction.iface.up = true;
    } else if (frame.get("opcode") == OSIFS_OP_SEND_PACKET) {
        transaction.iface.input(
            frame.get("ethertype"),
            {
                buffer: frame.get("payload"), // i do not rememeber how anything works
            }
        )
    }


    transactions = transactions.filter(t => t !== transaction)
}



function send_init(iface: OSInterface) {
    let transaction: typeof transactions[number] = {
        opcode: OSIFS_OP_INIT,
        clid: iface.clientid,
        xid: Math.floor(Math.random() * 10_000),
        iface: iface
    }

    let frame = OSIFS_FRAME.create({
        version: OSIFS_VERSION,
        opcode: transaction.opcode,
        transactionid: transaction.xid,
        payload: uint8_fromString(JSON.stringify({
            // leave room for options
        }, null, 0))
    });


    websocket.send(frame.getBuffer())
    transactions.push(transaction)
}

function send_packet(iface: OSInterface, ethertype: EtherType, data: NetworkData) {
    let transaction: typeof transactions[number] = {
        opcode: OSIFS_OP_SEND_PACKET,
        clid: iface.clientid,
        xid: Math.floor(Math.random() * 50_000),
        iface: iface
    }

    let frame = OSIFS_FRAME.create({
        version: OSIFS_VERSION,
        opcode: transaction.opcode,
        clientid: transaction.clid,
        transactionid: transaction.xid,
        ethertype: ethertype,
        payload: data.buffer
    })

    websocket.send(frame.getBuffer())
    transactions.push(transaction)
}

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
            send_packet(this, ETHER_TYPES.IPv4, data)
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
        send_init(this)
        return { success: true, data: undefined, error: undefined }
    }
}