import { BaseAddress } from "../address/base";
import { IPV4Address } from "../address/ipv4";
import { ALL_LINK_LOCAL_NODES_ADDRESSV6, IPV6Address } from "../address/ipv6";
import { MACAddress } from "../address/mac";
import { AddressMask, createMask } from "../address/mask";
import { and, not, or } from "../binary";
import { uint8_concat, uint8_equals, uint8_matchLength, uint8_readUint32BE } from "../binary/uint8-array";
import { ETHERNET_HEADER, ETHER_TYPES, EtherType } from "../header/ethernet";
import { IPV4_HEADER, IPV4_PSEUDO_HEADER, IPV6_HEADER, IPV6_PSEUDO_HEADER, PROTOCOLS } from "../header/ip";
import { ARP_HEADER, ARP_OPCODES, createARPHeader } from "../header/arp";
import { PacketCaptureHFormat, PacketCaptureNFormat, PacketCaptureRecordReader } from "../packet-capture/reader";
import { calculateChecksum } from "../binary/checksum";
import { ICMPV6_TYPES, ICMP_HEADER, ICMP_NDP_HEADER } from "../header/icmp";
import { UDP_HEADER } from "../header/udp";

// source <https://stackoverflow.com/a/63029283>
type DropFirst<T extends unknown[]> = T extends [any, ...infer U] ? U : never;

const _UNSET_ADDRESS_IPV4 = new IPV4Address("0.0.0.0"),
    _UNSET_ADDRESS_IPV6 = new IPV6Address("::'");

export type NeighborEntry<AddressT extends BaseAddress = BaseAddress> = {
    neighbor: AddressT;
    iface: BaseInterface;
    macAddress: MACAddress;
    createdAt: number;
};

export type DeviceResult<E extends unknown = unknown, D extends unknown = undefined> = {
    success: boolean;

    message?: string;
    error?: E;
    data?: D;
} & ({
    success: false;
    error: E;
} | {
    data: D;
})

export type NetworkData = {
    buffer: Uint8Array;
    broadcast?: boolean;
    rcvif?: BaseInterface;

    // !TODO: use the extra features that this structure provides
    type?: "DATA" | "HEADER";
}

export type DeviceRoute<AddrType extends typeof BaseAddress = typeof BaseAddress> = {
    destination: InstanceType<AddrType>;
    netmask: AddressMask<AddrType>;
    gateway: InstanceType<AddrType>;

    /** this is statically set by a human */
    f_static?: true;
    f_dynamic?: true;
    f_gateway?: true;
    f_host?: true;

    iface: BaseInterface;
}


type ContactAF = "RAW" | "IPv4" | "IPv6";
type ContactProto = "RAW" | "UDP";
type ContactReciever = (contact: Contact2, data: NetworkData, caddr?: ContactAddress2<BaseAddress>) => void;
type ContactError = unknown; // !TODO: conjure up some type of problems that might occur

type ContactAddress2<Addr extends BaseAddress> = {
    sport: number;
    dport: number;
    saddr: Addr;
    daddr: Addr;
}

export interface Contact2<AF extends ContactAF = ContactAF, Proto extends ContactProto = ContactProto, AT extends typeof BaseAddress = typeof BaseAddress, Addr extends BaseAddress = InstanceType<AT>> {
    status: "OPEN" | "CLOSED";

    addressFamily: AF;
    proto: Proto;

    /** address naming is just a placeholder */
    address?: ContactAddress2<Addr>;

    /* Methods */
    close(contact: Contact2<AF, Proto, AT, Addr>): DeviceResult<ContactError>;
    bind(contact: Contact2<AF, Proto, AT, Addr>, caddr: ContactAddress2<Addr>): DeviceResult<ContactError, typeof caddr>;

    receive(contact: Contact2, receiver: ContactReciever): DeviceResult<ContactError>;
    receiveFrom(contact: Contact2, receiver: ContactReciever, caddr: Partial<ContactAddress2<Addr>>): DeviceResult<ContactError>;

    send(contact: Contact2<AF, Proto, AT, Addr>, data: NetworkData, destination?: Addr, rtentry?: DeviceRoute<AT>): DeviceResult<ContactError>;
    sendTo(contact: Contact2<AF, Proto, AT, Addr>, data: NetworkData, caddr?: Partial<ContactAddress2<Addr>>, rtentry?: DeviceRoute<AT>): DeviceResult<ContactError>;

}

export type Program = {
    name: string;
    description?: string;
    content?: string;
    // sub?: Program<unknown>[];

    init(proc: Process, args: string[]): ProcessSignal;

    /** this is just extra complexity for no specific reason */
    sub?: Program[];
}

export enum ProcessSignal {
    EXIT, INTERRUPT, ERROR = ProcessSignal.EXIT,
    /** Explicit means that the user is in charge of closing the process */
    __EXPLICIT__
};
export type ProcessID = string; // number[] !TODO: it could be an array of numbers becouse then it would make things easier in coding
export type ProcessHandler = (proc: Process, signal: ProcessSignal) => void;
export type ProcessTerminalReadFunc = (proc: Process, bytes: Uint8Array) => void | true;
export type Process<DT = any> = {
    status: "UNINIT" | "MARKED_CLOSED" | "CLOSED" | "RUNNING"

    id: ProcessID;
    device: Device2;
    program: Program;
    data: DT;


    close(proc: Process, status: ProcessSignal): void;
    spawn(proc: Process, program: Program, args: string[], handle_close?: ProcessHandler): Process | undefined;
    handle(proc: Process, signal_handler: (proc: Process, signal: ProcessSignal) => void): void

    term_read(proc: Process, read_func: ProcessTerminalReadFunc): void
    term_write(data: Uint8Array): void;
    term_flush(): void;

    // !TODO: for now it is the users responsibility to close contacts
}

type DeviceTerminal = {
    read?: (bytes: Uint8Array) => void;
    write(bytes: Uint8Array): void;
    flush(): void;
}

function __contact_throw_if_closed(contact: Contact2) {
    if (contact.status === "CLOSED") {
        throw new Error("contact has been closed");
    }
}
function __address_is_unset(address: BaseAddress): boolean {
    let sum = 0, i = 0; while (i < address.buffer.byteLength) {
        sum += address.buffer[i++];
    }
    return sum === 0;
}

export function __find_best_caddr_match<CR extends ({ contact: Contact2 } | undefined)>(af: ContactAF, input_caddr: ContactAddress2<BaseAddress>, creceivers: CR[]): CR | undefined {
    let best: CR | undefined = undefined;
    for (let creceiver of creceivers) {
        if (!creceiver || creceiver.contact.addressFamily != af || creceiver.contact.proto != "UDP") {
            continue;
        }

        if (!creceiver.contact.address) {
            continue;
        }

        let caddr = creceiver.contact.address;
        if (caddr.dport != 0 && caddr.dport != input_caddr.dport) {
            continue
        } else if (caddr.sport != 0 && caddr.sport != input_caddr.sport) {
            continue
        }

        if (!__address_is_unset(caddr.daddr) && !uint8_equals(caddr.daddr.buffer, input_caddr.daddr.buffer)) {
            continue;
        } else if (!__address_is_unset(caddr.saddr) && !uint8_equals(caddr.saddr.buffer, input_caddr.saddr.buffer)) {
            continue;
        }
        if (!best) {
            best = creceiver;
        } else {
            if ((caddr.dport == 0 && best.contact.address?.dport != 0) ||
                (caddr.sport == 0 && best.contact.address?.sport != 0) ||
                (__address_is_unset(caddr.daddr) && !__address_is_unset(best.contact.address!.daddr)) ||
                (__address_is_unset(caddr.saddr) && !__address_is_unset(best.contact.address!.saddr))
            ) {
                continue;
            }
            best = creceiver;
        }
    }

    return best;
}

export class Device2 {
    name = Math.floor(Math.random() * 10_000).toString() + "B2";

    constructor() { }

    /** this approach is different in such a way that it allows to select for a specific interfac if that something i would like to do */
    private log_records: { time: number, buffer: Uint8Array, iface: BaseInterface }[] = []
    /** This thing is only to be called by interfaces that know the magic sauce  */
    log(data: NetworkData, type: "SEND" | "RECEIVE", record = true) {
        // data.buffer is a complete ethernet frame

        let iface = data.rcvif;
        if (!iface) {
            console.warn("rcif missing")
            return;
        }

        let reader = new PacketCaptureRecordReader({
            "Hformat": PacketCaptureHFormat.unknown,
            "Nformat": PacketCaptureNFormat.unknown,
            bigEndian: true,
        })

        let frame_info = reader.readEthernet(data.buffer, data.buffer.length)

        let iface_name = iface.name + iface.unit;

        if (type == "RECEIVE") {
            console.info(`${this.name} - ${iface_name}: received a frame from ${frame_info.saddr}`)
        } else if (type == "SEND") {
            console.info(`${this.name} - ${iface_name}: sent a frame to ${frame_info.daddr}`)
        }

        if (!record) {
            return;
        }

        this.log_records.push({
            time: Date.now(),
            buffer: data.buffer,
            iface
        })
    }

    log_select_records(iface_id?: string): Device2["log_records"] {
        if (!iface_id) {
            return this.log_records
        }
        return this.log_records.filter((record) => record.iface.name + record.iface.unit == iface_id)
    }

    /*
    THIS IS RESERVED SPACE FOR PROCESS LOGIC
    
    */
    programs: Program[] = [];
    private processes: (Process | undefined)[] = [];
    private process_handlers: ({ proc: Process, handler: ProcessHandler, id: ProcessID } | undefined)[] = [];
    private PROCESS_ID_SEPARATOR = ":";
    process_start(program: Program, args: string[], proc?: Process): Process | undefined {
        let i = -1; while (this.processes[++i]) { continue; };

        let id: ProcessID = "";
        if (proc) {
            id = proc.id + this.PROCESS_ID_SEPARATOR;
        }

        if (id.length > 100) {
            console.warn("id length too long; this might be caused by a spawn loop");
            return;
        }

        this.processes[i] = {
            status: "UNINIT",

            id: id + program.name + i,
            device: this,
            program: program,
            data: undefined,

            close: this.process_close.bind(this),
            spawn: this.process_spawn.bind(this),
            handle: this.process_handle.bind(this),

            term_read: this.process_term_read.bind(this),
            term_write: this.process_term_write.bind(this),
            term_flush: this.process_term_flush.bind(this),
        };

        let init_sig = program.init(this.processes[i]!, args);
        if (init_sig !== ProcessSignal.__EXPLICIT__) {
            this.process_close(this.processes[i]!, init_sig)
            return undefined;
        };
        return this.processes[i];
    }

    process_close(proc: Process, signal: ProcessSignal) {
        if (proc.status === "CLOSED") {
            return; // to prevent loops 
        } else {
            proc.status = "CLOSED"
        }

        let i = this.processes.indexOf(proc);
        if (i < 0 || !this.processes[i]) {
            return;
        }

        // first remove handlers
        for (let hj = 0; hj < this.process_handlers.length; hj++) {
            let h = this.process_handlers[hj]
            if (!h || !h.id.startsWith(h.proc.id)) {
                continue;
            }
            // if process has a owner call handle_close if it exists
            if ((h.proc.id === proc.id && signal != ProcessSignal.EXIT) || h.proc.id != h.id && h.id == proc.id) {
                h.handler(h.proc, signal);
            }

            delete this.process_handlers[hj];
        }

        // close spawned processes, abuse the id
        for (let sproc of this.processes) {
            if (sproc && sproc.id.startsWith(proc.id) + this.PROCESS_ID_SEPARATOR && sproc.id.length > proc.id.length) {
                this.process_close(sproc, signal);
            }
        }

        // remove terminal readers
        this.terminal_readers = this.terminal_readers.filter((tr) => tr.proc != proc);
        proc.term_write = this.process_term_writeblackhole;
        proc.term_flush = this.process_term_flushblackhole;
        delete this.processes[i];
    }

    process_spawn: Process["spawn"] = (proc, program, args, handle_close) => {
        // !TODO: add thing that is bound to handle close
        let spawned_proc: Process | undefined = this.process_start(program, args, proc);

        if (!spawned_proc) {
            handle_close && handle_close(proc, ProcessSignal.EXIT);
            return undefined;
        }

        if (handle_close) {
            this.process_handle(proc, handle_close, spawned_proc.id);
        }

        return spawned_proc;
    }

    process_handle(proc: Process, handler: ProcessHandler, id?: ProcessID) {
        let i = -1; while (this.process_handlers[++i]) { continue; };
        this.process_handlers[i] = {
            proc: proc,
            handler: handler,
            id: id ? id : proc.id
        }
    }

    private terminal?: DeviceTerminal;
    /** NOTE this has to stay ordered for certain logic to work */
    private terminal_readers: { proc: Process, reader: ProcessTerminalReadFunc }[] = [];
    terminal_attach(term: DeviceTerminal) {
        if (this.terminal) {
            this.terminal_detach();
        }
        this.terminal = term;
        this.terminal.read = this.terminal_read.bind(this);
    }

    terminal_detach() {
        if (!this.terminal) {
            return;
        }
        delete this.terminal.read;
        delete this.terminal;
    }

    private terminal_read(bytes: Uint8Array) {
        for (let tr of this.terminal_readers) {
            if (tr.reader(tr.proc, bytes)) {
                break;
            }
        }
    }

    private process_term_read(proc: Process, reader_func: ProcessTerminalReadFunc) {
        this.terminal_readers.unshift({ proc: proc, reader: reader_func });
    }
    private process_term_write(bytes: Uint8Array) { (this.terminal) && this.terminal.write(bytes); }
    private process_term_writeblackhole(_: Uint8Array) { }
    private process_term_flush() { (this.terminal) && this.terminal.flush(); }
    private process_term_flushblackhole() { }


    output_udp(data: NetworkData, destination: BaseAddress, route?: DeviceRoute): DeviceResult<"HOSTUNREACH" | "ERROR"> {
        if (!route && !(route = this.route_resolve(destination))) return {
            success: false,
            error: "HOSTUNREACH",
            message: "No outgoing route found"
        }
        // select an address from the outgoing interface
        let source = route.iface.addresses.find(value => value.address.constructor == destination.constructor);
        if (!source) return {
            success: false,
            error: "HOSTUNREACH",
            message: "no source address for intreface found"
        }

        if (data.buffer.length < UDP_HEADER.getMinSize()) return { success: false, error: "ERROR", message: "bad header" };
        let udphdr = UDP_HEADER.from(data.buffer);
        udphdr.set("length", udphdr.getBuffer().byteLength);

        let ip_output: Device2["output_ipv4"];
        let iphdr: typeof IPV4_HEADER | typeof IPV6_HEADER;

        udphdr.set("csum", 0);
        if (destination instanceof IPV4Address) {
            let pseudohdr = IPV4_PSEUDO_HEADER.create({
                saddr: source.address as IPV4Address,
                daddr: destination,
                proto: PROTOCOLS.UDP,
                len: udphdr.get("length")
            });

            udphdr.set("csum", calculateChecksum(uint8_concat([pseudohdr.getBuffer(), udphdr.getBuffer()])) || 0xffff);
            ip_output = this.output_ipv4;
            iphdr = IPV4_HEADER.create({ proto: PROTOCOLS.UDP, payload: udphdr.getBuffer() });
        } else if (destination instanceof IPV6Address) {
            let pseudohdr = IPV6_PSEUDO_HEADER.create({
                saddr: source.address as IPV6Address,
                daddr: destination,
                proto: PROTOCOLS.UDP,
                len: udphdr.get("length")
            });

            udphdr.set("csum", calculateChecksum(uint8_concat([pseudohdr.getBuffer(), udphdr.getBuffer()])));
            ip_output = this.output_ipv6;
            iphdr = IPV6_HEADER.create({ nextHeader: PROTOCOLS.UDP, payload: udphdr.getBuffer() });
        } else {
            return { success: false, error: "HOSTUNREACH", message: "destination MUST be an ip address" };
        }

        data.buffer = iphdr.getBuffer();
        return ip_output(data, destination, route)
    }

    input_ipv4(iphdr: typeof IPV4_HEADER, data: NetworkData) {
        if (!data.rcvif) { console.warn("rcvif missing"); return }
        if (calculateChecksum(iphdr.getBuffer().slice(0, iphdr.get("ihl") << 2)) != 0) {
            // checksum failed
            console.warn("input_ipv4: [bad checksum]")
            return;
        }

        this.contact_input_raw("RAW", data);

        if ((iphdr.get("flags") & (1 << 2)) < 0) {
            throw "ipv4 fragments not supported"
        }

        // !TODO: verify that daddr is for this device
        // !TODO: maybe support routing somehow idk

        if (iphdr.get("proto") == PROTOCOLS.UDP) {
            this.input_udp4(iphdr, data)
        } else {
            this.contact_input_raw("IPv4", { ...data, buffer: iphdr.getBuffer() });
        }


    }

    output_ipv4(data: NetworkData, destination: IPV4Address, route?: DeviceRoute): DeviceResult<"HOSTUNREACH" | "ERROR"> {
        /** So the thinking is that the user would construct the iphdr */

        // Select route
        if (!route && !(route = this.route_resolve(destination))) return {
            success: false,
            error: "HOSTUNREACH",
            message: "No outgoing route found"
        }
        // select an address from the outgoing interface
        let source = route.iface.addresses.find(value => value.address.constructor == destination.constructor);
        if (!source) return {
            success: false,
            error: "HOSTUNREACH",
            message: "no source address for intreface found"
        }
        //  I'm unsure of how i want to access the outgoing data and if the iphdr has all the requisite data
        if (data.buffer.length < IPV4_HEADER.getMinSize()) return { success: false, error: "ERROR", message: "bad header" };
        let iphdr = IPV4_HEADER.from(data.buffer);

        iphdr.set("version", 4);
        iphdr.set("ihl", iphdr.get("ihl") || iphdr.getMinSize() >> 2); // the user can set the ihl
        iphdr.set("tos", 0);
        const DEFAULT_TTL = 64; iphdr.set("ttl", iphdr.get("ttl") || DEFAULT_TTL);
        iphdr.set("len", iphdr.getBuffer().byteLength);

        if (uint8_readUint32BE(iphdr.get("daddr").buffer) === 0)
            iphdr.set("daddr", destination);
        if (uint8_readUint32BE(iphdr.get("saddr").buffer) === 0)
            iphdr.set("saddr", source.address); // if there's no source set; use the outgoing interfaces ip address

        if (iphdr.get("len") > route.iface.mtu) {
            return {
                success: false,
                error: "ERROR",
                message: "i do not support fragmentation"
            }
        }

        iphdr.set("csum", 0);
        iphdr.set("csum", calculateChecksum(iphdr.getBuffer().slice(0, iphdr.get("ihl") << 2)));

        data.buffer = iphdr.getBuffer()

        // put some thinking to if the destination is a broadcast address
        let broadcast = uint8_readUint32BE(not(or(source.netmask.buffer, iphdr.get("daddr").buffer))) === 0;
        if (broadcast) { data.broadcast = broadcast }

        let res = route.iface.output(data, destination, route);

        return {
            success: res.success,
            error: res.error ? "ERROR" : undefined,
            data: res.data
        }
    }

    input_udp4(iphdr: typeof IPV4_HEADER, data: NetworkData) {
        let udphdr = UDP_HEADER.from(iphdr.get("payload"));

        if (udphdr.get("csum") > 0) {
            let pseudohdr = IPV4_PSEUDO_HEADER.create({
                saddr: iphdr.get("saddr"),
                daddr: iphdr.get("daddr"),
                proto: PROTOCOLS.UDP,
                len: udphdr.get("length")
            });

            if (calculateChecksum(uint8_concat([pseudohdr.getBuffer(), udphdr.getBuffer()])) !== 0) {
                console.warn("input_udp4: [bad checksum]")
                return;
            }
        }

        this.contact_input_udp("IPv4", { ...data, buffer: udphdr.get("payload") }, {
            saddr: iphdr.get("daddr"),
            daddr: iphdr.get("saddr"),
            sport: udphdr.get("dport"),
            dport: udphdr.get("sport")
        });
    }

    input_udp6(iphdr: typeof IPV6_HEADER, data: NetworkData) {
        let udphdr = UDP_HEADER.from(iphdr.get("payload"));
        let pseudohdr = IPV6_PSEUDO_HEADER.create({
            saddr: iphdr.get("saddr"),
            daddr: iphdr.get("daddr"),
            proto: PROTOCOLS.UDP,
            len: udphdr.get("length")
        });

        if (calculateChecksum(uint8_concat([pseudohdr.getBuffer(), udphdr.getBuffer()])) !== 0) {
            console.warn("input_udp6: [bad checksum]")
            return;
        }

        this.contact_input_udp("IPv6", { ...data, buffer: udphdr.get("payload") }, {
            saddr: iphdr.get("daddr"),
            daddr: iphdr.get("saddr"),
            sport: udphdr.get("dport"),
            dport: udphdr.get("sport")
        });
    }

    input_ipv6(iphdr: typeof IPV6_HEADER, data: NetworkData) {
        if (!data.rcvif) { console.warn("rcvif missing"); return }
        // demultiplex data
        // in reality there should be some checking as if the packet is for the device


        if (iphdr.get("nextHeader") === PROTOCOLS.IPV6_ICMP) {
            return this.input_icmp6(iphdr, data);
        } else if (iphdr.get("nextHeader") === PROTOCOLS.UDP) {
            return this.input_udp6(iphdr, data);
        } else {
            // console.log(iphdr.getBuffer())
            this.contact_input_raw("IPv6", { ...data, buffer: iphdr.getBuffer() });
        }

        this.contact_input_raw("RAW", data);
    }

    output_ipv6(data: NetworkData, destination: IPV6Address, route?: DeviceRoute): DeviceResult<"HOSTUNREACH" | "ERROR"> {
        // Select route
        if (!route && !(route = this.route_resolve(destination))) return {
            success: false,
            error: "HOSTUNREACH",
            message: "No outgoing route found"
        }

        // select an address from the outgoing interface
        let source = route.iface.addresses.find(value => value.address.constructor == destination.constructor);
        if (!source) return {
            success: false,
            error: "HOSTUNREACH",
            message: "no source address for intreface found"
        }

        if (data.buffer.length < IPV6_HEADER.getMinSize()) return { success: false, error: "ERROR", message: "bad header" };
        let iphdr = IPV6_HEADER.from(data.buffer);

        iphdr.set("version", 6);
        // flow label something maybe i don't know
        const DEFAULT_TTL = 64; iphdr.set("hopLimit", iphdr.get("hopLimit") || DEFAULT_TTL);
        iphdr.set("payloadLength", iphdr.get("payload").byteLength);

        if (iphdr.get("daddr").toString(4) == "::")
            iphdr.set("daddr", destination);
        if (iphdr.get("saddr").toString(4) == "::")
            iphdr.set("saddr", source.address as IPV6Address); // if there's no source set; use the outgoing interfaces ip address

        if (iphdr.get("payloadLength") > route.iface.mtu) {
            return {
                success: false,
                error: "ERROR",
                "message": "i do not support fragmentation"
            }
        }

        data.buffer = iphdr.getBuffer();

        let broadcast = destination.isMulticast();
        if (broadcast) { data.broadcast = broadcast }

        let res = route.iface.output(data, destination, route);

        return {
            success: res.success,
            error: res.error ? "ERROR" : undefined,
            data: res.data
        }
    }

    input_icmp6(iphdr: typeof IPV6_HEADER, data: NetworkData) {

        let icmphdr = ICMP_HEADER.from(iphdr.get("payload"));
        if (icmphdr.get("type") === ICMPV6_TYPES.NEIGHBOR_ADVERTISMENT) {

        }

        switch (icmphdr.get("type")) {
            case ICMPV6_TYPES.NEIGHBOR_ADVERTISMENT:
                this.input_ndp_advertisment(iphdr, data); break;
            case ICMPV6_TYPES.NEIGHBOR_SOLICITATION:
                this.input_ndp_solicitation(iphdr, data); break;
            default: {
                this.contact_input_raw("IPv6", { ...data, buffer: iphdr.getBuffer() });
            }
        }
    }

    input_ndp_advertisment(iphdr: typeof IPV6_HEADER, data: NetworkData) {
        if (!(data.rcvif instanceof EthernetInterface)) {
            return;
        }

        let icmphdr = ICMP_HEADER.from(iphdr.get("payload")),
            ndphdr = ICMP_NDP_HEADER.from(icmphdr.get("data")),
            ethhdr = ETHERNET_HEADER.from(data.buffer);

        this.arp_cache_entry(ndphdr.get("targetAddress"), {
            neighbor: iphdr.get("saddr"),
            iface: data.rcvif,
            macAddress: ethhdr.get("smac"),
            createdAt: Date.now()
        });
    }

    input_ndp_solicitation(iphdr: typeof IPV6_HEADER, data: NetworkData) {
        if (!(data.rcvif instanceof EthernetInterface)) {
            return;
        }

        let icmphdr = ICMP_HEADER.from(iphdr.get("payload")),
            ndphdr = ICMP_NDP_HEADER.from(icmphdr.get("data")),
            ethhdr = ETHERNET_HEADER.from(data.buffer);

        let iface = this.interfaces.find(({ addresses }) => addresses.find(({ address }) => uint8_equals(address.buffer, ndphdr.get("targetAddress").buffer)))
        if (!iface) {
            return
        }
        let saddr = iface.addresses.find(({ address }) => uint8_equals(address.buffer, ndphdr.get("targetAddress").buffer))?.address, daddr = iphdr.get("saddr");
        if (!saddr) return; // this should not happen due to the previous check

        // this might not be the correct way of doing this but in fantasy-land this goes
        this.arp_cache_entry(iphdr.get("saddr"), {
            neighbor: saddr, // i do not know what this value is doing
            iface: data.rcvif,
            macAddress: ethhdr.get("smac"),
            createdAt: Date.now()
        });

        // reply to ndp Request
        // !TODO: add the solicited flag
        let replyIcmpHdr = ICMP_HEADER.create({
            type: ICMPV6_TYPES.NEIGHBOR_ADVERTISMENT,
            data: ndphdr.getBuffer()
        })

        // The actual spec <https://www.rfc-editor.org/rfc/rfc4443#section-2.3>
        let pseudoHdr = IPV6_PSEUDO_HEADER.create({
            saddr: saddr as IPV6Address,
            daddr: daddr,
            len: replyIcmpHdr.size,
            proto: PROTOCOLS.IPV6_ICMP,
        })

        replyIcmpHdr.set("csum", calculateChecksum(uint8_concat([
            pseudoHdr.getBuffer(),
            replyIcmpHdr.getBuffer()
        ])));

        let replyIPHdr = IPV6_HEADER.create({
            saddr: saddr as IPV6Address,
            daddr: daddr,
            nextHeader: PROTOCOLS.IPV6_ICMP,
            payloadLength: replyIcmpHdr.size,
            payload: replyIcmpHdr.getBuffer()
        })

        data.rcvif.output({ buffer: replyIPHdr.getBuffer() }, new BaseAddress(ETHERNET_HEADER.create({
            dmac: ethhdr.get("smac"),
            smac: data.rcvif.macAddress,
            ethertype: ETHER_TYPES.IPv6
        }).getBuffer()),
            {} as DeviceRoute // this is hacky but should work
        )
    }

    input_arp(etherheader: typeof ETHERNET_HEADER, data: NetworkData) {
        if (!data.rcvif) { console.warn("rcvif missing"); return };
        if (!(data.rcvif instanceof EthernetInterface)) return;

        let arpHdr = ARP_HEADER.from(etherheader.get("payload")), rcvif = data.rcvif;

        if (arpHdr.get("oper") == ARP_OPCODES.REPLY) {
            // add entry to neigbor map
            let arpHdr = ARP_HEADER.from(etherheader.get("payload"));

            if (arpHdr.get("ptype") != ETHER_TYPES.IPv4) {
                return
            }

            this.arp_cache_entry(arpHdr.get("tpa"), {
                neighbor: arpHdr.get("spa"),
                iface: data.rcvif,
                macAddress: etherheader.get("smac"),
                createdAt: Date.now()
            });
        } else if (arpHdr.get("oper") == ARP_OPCODES.REQUEST) {
            // sanity check 
            if (!(data.rcvif instanceof EthernetInterface)) {
                return
            }

            let tpa = arpHdr.get("tpa");

            // naive approach in actuality i should check all interfaces but then again tha might caus unforseen challenging

            let iface = this.interfaces.find(({ addresses }) => addresses.find(({ address }) => uint8_equals(address.buffer, tpa.buffer)))
            if (!iface) {
                return
            }

            let replyARPHdr = arpHdr.create({
                oper: ARP_OPCODES.REPLY,
                tha: rcvif.macAddress
            }), replyEthHdr = ETHERNET_HEADER.create({
                dmac: arpHdr.get("sha"),
                smac: rcvif.macAddress,
                ethertype: ETHER_TYPES.ARP
            })

            rcvif.output({
                type: "DATA",
                buffer: replyARPHdr.getBuffer()
            }, new BaseAddress(replyEthHdr.getBuffer()),
                {} as DeviceRoute // this is hacky but should work
            )
        }
    }

    input_ether(etherframe: typeof ETHERNET_HEADER, data: NetworkData) {
        if (etherframe.get("ethertype") == ETHER_TYPES.IPv4) {
            this.input_ipv4(
                IPV4_HEADER.from(etherframe.get("payload")),
                { rcvif: data.rcvif, broadcast: data.broadcast, buffer: etherframe.getBuffer() }
            )
        } else if (etherframe.get("ethertype") == ETHER_TYPES.IPv6) {
            this.input_ipv6(
                IPV6_HEADER.from(etherframe.get("payload")),
                { rcvif: data.rcvif, broadcast: data.broadcast, buffer: etherframe.getBuffer() }
            )
        } else if (etherframe.get("ethertype") == ETHER_TYPES.ARP) {
            this.input_arp(etherframe, { rcvif: data.rcvif, broadcast: data.broadcast, buffer: etherframe.getBuffer().slice(0, ETHERNET_HEADER.getMinSize()) })
        } else if (etherframe.get("ethertype") == ETHER_TYPES.VLAN) {
            throw new Error("not implemented")
        } else {
            this.contact_input_raw("RAW", data);
        }

        // this knows that the data is an ethernet frame

        // this should do something or mayber there something listening to all traffic that would be interested in this
    }

    arp_sendqueue = new Map<string, (Parameters<BaseInterface["output"]> | null)[]>();
    arp_cache = new Map<string, NeighborEntry<BaseAddress>>();
    arp_resolve(data: NetworkData, destination: BaseAddress, rtentry: DeviceRoute): MACAddress | null {
        if (data.broadcast) {
            // destination is meant to be broad casted
            return new MACAddress("ff:ff:ff:ff:ff:ff")
        }

        // if destination is not directly connected to source network
        if (rtentry.f_gateway) {
            destination = rtentry.gateway
        }

        let entry = this.arp_cache.get(destination.toString());
        if (entry) {
            return entry.macAddress;
        }

        rtentry.f_gateway = undefined; // this is hacky but logically it should be reasonable

        if (destination instanceof IPV4Address) {
            this.arp_enqueue(data, destination, rtentry);
            // send away arp request
            for (let iface of this.interfaces) {
                if (!(iface instanceof EthernetInterface) || !iface.up) {
                    continue
                }

                let spa = iface.addresses.find(({ address }) => address instanceof IPV4Address)?.address;
                if (!spa) {
                    spa = new IPV4Address("0.0.0.0")
                }

                let arpHeader = createARPHeader({
                    oper: ARP_OPCODES.REQUEST,
                    sha: iface.macAddress,
                    spa: spa,
                    tpa: destination
                })

                // wrap packet in ethernet frame
                iface.output({
                    type: "DATA",
                    buffer: arpHeader.getBuffer(),
                    broadcast: true
                }, new BaseAddress(ETHERNET_HEADER.create({
                    dmac: new MACAddress("ff:ff:ff:ff:ff:ff"),
                    smac: iface.macAddress,
                    ethertype: ETHER_TYPES.ARP,
                }).getBuffer()), {} as DeviceRoute)
            }
        } else if (destination instanceof IPV6Address) {
            this.arp_enqueue(data, destination, rtentry);
            for (let iface of this.interfaces) {
                if (!(iface instanceof EthernetInterface) || !iface.up) continue;

                let ndpHdr = ICMP_NDP_HEADER.create({
                    targetAddress: destination
                }), icmpHdr = ICMP_HEADER.create({
                    type: ICMPV6_TYPES.NEIGHBOR_SOLICITATION,
                    data: ndpHdr.getBuffer()
                });

                let saddr = iface.addresses.find(({ address }) => address instanceof IPV6Address)?.address;
                if (!saddr) {
                    continue;
                }

                let daddr = new IPV6Address(ALL_LINK_LOCAL_NODES_ADDRESSV6);

                // The actual spec <https://www.rfc-editor.org/rfc/rfc4443#section-2.3>
                let pseudoHdr = IPV6_PSEUDO_HEADER.create({
                    saddr: saddr as IPV6Address,
                    daddr: daddr,
                    len: icmpHdr.size,
                    proto: PROTOCOLS.IPV6_ICMP,
                })

                icmpHdr.set("csum", calculateChecksum(uint8_concat([
                    pseudoHdr.getBuffer(),
                    icmpHdr.getBuffer()
                ])));

                let ipv6Hdr = IPV6_HEADER.create({
                    saddr: saddr as IPV6Address,
                    daddr: daddr,
                    nextHeader: PROTOCOLS.IPV6_ICMP,
                    payloadLength: icmpHdr.size,
                    payload: icmpHdr.getBuffer()
                })

                // wrap packet in ethernet frame
                iface.output({
                    type: "DATA",
                    buffer: ipv6Hdr.getBuffer(),
                    broadcast: true
                }, new BaseAddress(ETHERNET_HEADER.create({
                    dmac: new MACAddress("ff:ff:ff:ff:ff:ff"),
                    smac: iface.macAddress,
                    ethertype: ETHER_TYPES.IPv6,
                }).getBuffer()), {} as DeviceRoute)
            }
        }

        return null;
    }
    arp_enqueue(...[data, destination, rtentry]: Parameters<BaseInterface["output"]>) {
        let items = this.arp_sendqueue.get(destination.toString())
        if (!items) {
            items = [];
        }
        items.push([data, destination, rtentry]);
        this.arp_sendqueue.set(destination.toString(), items);
    }
    arp_cache_entry(destination: BaseAddress, entry: NeighborEntry<BaseAddress>) {
        this.arp_cache.set(destination.toString(), entry);

        // this could be a function call

        let items = this.arp_sendqueue.get(destination.toString());
        this.arp_sendqueue.delete(destination.toString())
        if (!items) {
            return
        }
        for (let item of items) {
            if (!item || !item[2]) continue;
            item[2].iface.output(...item)
        }
    }

    routes: DeviceRoute[] = [];
    route_resolve(destination: BaseAddress): undefined | DeviceRoute {
        let route: DeviceRoute | undefined

        // 1 find host
        route = this.routes.find((value) => (
            (value.destination.constructor == destination.constructor) && value.iface.up &&
            value.f_host &&
            uint8_equals(value.destination.buffer, destination.buffer)
        ));

        if (!route) {
            // 2 find network
            route = this.routes.filter((value) => (
                (value.destination.constructor == destination.constructor) && value.iface.up &&
                !value.f_host &&
                value.netmask.compare(value.destination, destination)
            )).sort((a, b) => (
                uint8_matchLength(destination.buffer, b.destination.buffer) - uint8_matchLength(destination.buffer, a.destination.buffer)
            ) || b.netmask.length - a.netmask.length)[0]
        }

        return route;
    }

    interfaces: BaseInterface[] = [];
    // interface_add and interface_remove defined so that if further devices have som type extra configuration they want to do
    interface_add(iface: BaseInterface) { this.interfaces.push(iface) };
    interface_remove(iface: BaseInterface) { this.interfaces = this.interfaces.filter(f => f != iface) };

    interface_set_address<AT extends typeof BaseAddress>(iface: BaseInterface, address: InstanceType<AT>, netmask: AddressMask<AT>): DeviceResult { // !TODO: result could include the created route or address entry on iface idk
        // this functions maintains the information about the routes for the network that is just now configured

        // the thing is a interface could support having multiple addresses of the same type, but for simplicity, only one address is supported for now

        // 1st: check if iface already has a address set
        let addridx = iface.addresses.findIndex(value => value.address.constructor == address.constructor);

        // 2nd set the new address to iface
        if (addridx < 0) {
            iface.addresses.push({ netmask, address });
        } else {
            iface.addresses[addridx].address = address;
            iface.addresses[addridx].netmask = netmask;
        }

        // 3rd: remove routes that are not in the same network as the new network
        this.routes = this.routes.filter((rtentry) => {
            if (rtentry.iface !== iface) return true;
            if (rtentry.destination.constructor !== address.constructor) return true;
            if (rtentry.f_static) return true;

            // routes netmask cannot be looser than the new netmask
            if (!rtentry.f_gateway && rtentry.netmask.length < netmask.length) return false

            let destination: BaseAddress;
            if (rtentry.f_gateway) destination = rtentry.gateway;
            else destination = rtentry.destination;

            // check that thing is in the same "network" as the new route
            return netmask.compare(address, destination as InstanceType<AT>);
        });

        // 4th: create route information
        let rt_destination: BaseAddress, rt_gateway: BaseAddress;
        if (address instanceof IPV4Address) {
            rt_destination = new IPV4Address(and(netmask.buffer, address.buffer));
            rt_gateway = new IPV4Address("0.0.0.0");
        } else if (address instanceof IPV6Address) {
            rt_destination = new IPV6Address(and(netmask.buffer, address.buffer));
            rt_gateway = new IPV6Address("::")
        } else {
            throw new Error("could not add route addressType not recognised")
        }

        // 5th: check if a route for the network exists, if not add a new route
        if (!this.routes.find(value => value.iface === iface &&
            uint8_equals(value.destination.buffer, rt_destination.buffer) &&
            uint8_equals(value.gateway.buffer, rt_gateway.buffer) &&
            uint8_equals(value.netmask.buffer, netmask.buffer) &&
            !value.f_dynamic && !value.f_gateway && !value.f_host)) {
            this.routes.push({
                destination: rt_destination,
                gateway: rt_gateway,
                netmask: netmask,
                iface: iface
            })
        }

        return {
            success: true,
            data: undefined
        }
    }

    /** this is to ensure that contacts get given unique ephemeral ports */
    private contact_ephemport = 4001
    private contacts: (Contact2<ContactAF, ContactProto> | undefined)[] = [];
    private contact_receivers: ({ receiver: ContactReciever, contact: Contact2 } | undefined)[] = [];
    contact_create<CAF extends ContactAF, CProto extends ContactProto>(addressFamily: CAF, proto: CProto): DeviceResult<ContactError, Contact2<CAF, CProto>> {
        // do some rules checking
        if (addressFamily === "RAW" && proto !== "RAW") {
            return { success: false, error: "", message: "AF cannot be RAW when the proto is something other that RAW" }
        }

        // methods for sending and doing stuff
        let m_send: Contact2["send"],
            m_sendTo: Contact2["sendTo"],
            m_receiveFrom: Contact2["receiveFrom"];

        if (proto == "RAW") {
            m_send = this.contact_m_send_raw;
            m_sendTo = this.contact_method_not_supported;
            m_receiveFrom = this.contact_method_not_supported;
        } else if (proto == "UDP") {
            m_send = this.contact_m_send_udp;
            m_sendTo = this.contact_m_sendTo_udp;
            m_receiveFrom = this.contact_m_receiveFrom_udp;
        } else {
            return { success: false, error: undefined, message: "could not determine methods based on ContactProto: " + proto };
        }

        let i = -1; while (this.contacts[++i]) { continue; }
        this.contacts[i] = {
            status: "OPEN",
            addressFamily: addressFamily,
            proto: proto,

            close: this.contact_close.bind(this),
            bind: this.contact_bind.bind(this),

            receive: this.contact_receive.bind(this),
            receiveFrom: m_receiveFrom.bind(this),

            send: m_send.bind(this),
            sendTo: m_sendTo.bind(this)
        };

        return { success: true, data: this.contacts[i] as Contact2<CAF, CProto> };
    }
    contact_close(contact: Contact2): DeviceResult<ContactError> {
        __contact_throw_if_closed(contact);

        // have some logic to stop doing other stuff i.e. TCP


        // remove listeners for contact
        for (let i = 0; i < this.contact_receivers.length; i++) {
            if (this.contact_receivers[i]?.contact != contact) { continue; }
            delete this.contact_receivers[i];
        }

        let i = this.contacts.indexOf(contact);
        if (i >= 0 && this.contacts[i]) {
            // !TODO: in future add more logic to the removal of a contact
            // i.e. TCP has a cooldown period etc.
            this.contacts[i]!.status = "CLOSED"
            delete this.contacts[i];
            return { success: true, data: undefined }
        }

        return { success: false, error: undefined, message: "could not locate contact" }
    }
    contact_bind<Addr extends BaseAddress = BaseAddress>(contact: Contact2, caddr: ContactAddress2<Addr>): DeviceResult<ContactError, ContactAddress2<Addr>> {
        __contact_throw_if_closed(contact);
        if (contact.addressFamily == "RAW" || contact.proto == "RAW") {
            return { success: false, error: undefined, message: "cannot bind a RAW contact" };
        }

        if (contact.address) {
            return { success: false, error: undefined, message: "contact already bound" };
        }

        if (
            (caddr.daddr instanceof IPV4Address) && contact.addressFamily != "IPv4" ||
            (caddr.daddr instanceof IPV6Address) && contact.addressFamily != "IPv6" ||
            (caddr.saddr instanceof IPV4Address) && contact.addressFamily != "IPv4" ||
            (caddr.saddr instanceof IPV6Address) && contact.addressFamily != "IPv6"
        ) {
            return { success: false, error: undefined, message: "address mismatch" }
        };

        for (let h_contact of this.contacts) {
            if (!h_contact ||
                h_contact == contact ||
                !h_contact.address ||
                h_contact.proto != contact.proto ||
                caddr.daddr.constructor != h_contact.address.daddr.constructor ||
                caddr.saddr.constructor != h_contact.address.saddr.constructor ||
                caddr.sport != h_contact.address.sport ||
                caddr.dport != h_contact.address.dport
            ) continue;

            // test addresses
            if (
                uint8_equals(caddr.daddr.buffer, h_contact.address.daddr.buffer) &&
                uint8_equals(caddr.saddr.buffer, h_contact.address.saddr.buffer) &&
                caddr.dport == h_contact.address.dport &&
                caddr.sport == h_contact.address.sport
            ) return { success: false, error: undefined, message: "contact address already in use" };
        }

        // ignored because the logic above should ensure that all values are correct and inplace
        contact.address = caddr;
        return { success: true, data: caddr }
    }
    contact_receive: Contact2["receive"] = (contact, receiver) => {
        let i = -1; while (this.contact_receivers[++i]) { continue; };

        this.contact_receivers[i] = {
            contact: contact,
            receiver: receiver
        };

        return { success: true, data: undefined };
    }

    private contact_input_raw(af: ContactAF, ...receiver_params: DropFirst<Parameters<ContactReciever>>) {
        for (let creciver of this.contact_receivers) {
            if (!creciver || creciver.contact.addressFamily != af || creciver.contact.proto != "RAW") {
                continue;
            }
            creciver.receiver(creciver.contact, ...receiver_params);
        }
    }
    private contact_input_udp(af: ContactAF, ...receiver_params: DropFirst<Parameters<ContactReciever>>) {
        let input_caddr = receiver_params[1];
        if (!input_caddr) return;
        let best = __find_best_caddr_match(af, input_caddr, this.contact_receivers);
        if (!best) return;
        best.receiver(best.contact, ...receiver_params);
    }

    private contact_method_not_supported = (contact: Contact2): DeviceResult<ContactError> => {
        __contact_throw_if_closed(contact);
        return { success: false, error: undefined, message: "method not supported for protocol" }
    }

    private contact_m_send_raw: Contact2["send"] = (contact, data, destination, rtentry) => {
        __contact_throw_if_closed(contact);

        if (!destination) {
            return { success: false, error: undefined, message: "destination missing" }
        }

        if (contact.addressFamily == "RAW") {
            if (!rtentry) {
                return { success: false, error: undefined, message: "AF:RAW route missing" };
            }

            let res = rtentry.iface.output(data, destination, rtentry);
            return { success: res.success, error: undefined, data: undefined, message: res.message };
        }

        if (contact.addressFamily == "IPv4" && destination instanceof IPV4Address) {
            let res = this.output_ipv4(data, destination, rtentry as undefined | DeviceRoute<typeof IPV4Address>);
            return { success: res.success, error: undefined, data: undefined, message: res.message };
        }

        if (contact.addressFamily == "IPv6" && destination instanceof IPV6Address) {
            let res = this.output_ipv6(data, destination, rtentry as undefined | DeviceRoute<typeof IPV4Address>);
            return { success: res.success, error: undefined, data: undefined, message: res.message };
        }

        return { success: false, error: undefined, message: "failed to send" }
    }

    private contact_m_send_udp: Contact2["send"] = (contact, data, _, rtentry) => {
        __contact_throw_if_closed(contact);
        if (contact.addressFamily == "RAW") {
            return { success: false, error: undefined, message: "cannot send incorrect \"address family\": " + contact.addressFamily }
        }

        if (!contact.address) {
            return { success: false, error: undefined, message: "contact must be bound" };
        }

        let udphdr = UDP_HEADER.create({
            sport: contact.address.sport,
            dport: contact.address.dport,
            payload: data.buffer
        });

        data.buffer = udphdr.getBuffer();
        let res = this.output_udp(data, contact.address.daddr, rtentry);
        return { success: res.success, error: undefined, data: undefined, message: res.message }
    }

    private contact_m_sendTo_udp: Contact2["sendTo"] = (contact, data, caddr, rtentry) => {
        __contact_throw_if_closed(contact);
        if (contact.addressFamily == "RAW") {
            return { success: false, error: undefined, message: "cannot send incorrect \"address family\": " + contact.addressFamily };
        }

        if (contact.address) {
            return { success: false, error: undefined, message: "contact is bound, try using \"contact.send\”" };
        }

        if (!caddr?.daddr) {
            return { success: false, error: undefined, message: "daddr is missing" };
        } else if (!caddr?.dport) {
            return { success: false, error: undefined, message: "dport is missing" }
        }

        if (!caddr.saddr) {
            if (contact.addressFamily == "IPv4") {
                caddr.saddr = _UNSET_ADDRESS_IPV4
            } else if (contact.addressFamily == "IPv6") {
                caddr.saddr = _UNSET_ADDRESS_IPV6;
            } else {
                throw "unsupported address family"
            }
        }

        if (!caddr.sport) {
            caddr.sport = this.contact_ephemport = Math.max(10_011, ((this.contact_ephemport + 5)) % 0xffff);
        }

        let bres = this.contact_bind(contact, caddr as ContactAddress2<BaseAddress>);
        if (!bres.success) {
            return { success: false, error: bres.error, message: bres.message };
        }

        return this.contact_m_send_udp(contact, data, undefined, rtentry);
    }

    private contact_m_receiveFrom_udp: Contact2["receiveFrom"] = (contact, receiver, caddr) => {
        let bres = this.contact_bind(contact, {
            saddr: contact.addressFamily == "IPv4" ? _UNSET_ADDRESS_IPV4 : _UNSET_ADDRESS_IPV6,
            daddr: contact.addressFamily == "IPv4" ? _UNSET_ADDRESS_IPV4 : _UNSET_ADDRESS_IPV6,
            dport: 0,
            sport: 0,
            ...caddr
        });
        if (!bres.success) return bres as ReturnType<Contact2["receiveFrom"]>;
        return this.contact_receive(contact, receiver);
    }

    schedule_default_delay = 0;
    schedule<F extends () => void>(f: F, delay: number = this.schedule_default_delay) {
        if (delay < 0) { delay = this.schedule_default_delay; }

        // in future, create my own runtime because why not complexity is fun.
        window.setTimeout(f, delay)
    }
}

type DeviceAddress<AT extends typeof BaseAddress = typeof BaseAddress> = {
    address: InstanceType<AT>;
    // broadcast: InstanceType<AT>; // calculate broadcast on the fly
    netmask: AddressMask<AT>
}

type InterfaceName = "eth" | "lo"
class BaseInterface {
    /** The device this interface is attached to */
    device: Device2;
    name: InterfaceName;
    unit: number;

    addresses: DeviceAddress[];

    /** MAX TRANSMISSION UNIT */
    mtu: number;
    /** if interface is up and ready to send and receive */
    up: boolean;


    constructor(
        device: Device2,
        name: InterfaceName,
        unit: number,
        mtu: number = 256
    ) {
        this.device = device;
        this.name = name;
        this.unit = unit;

        this.addresses = [];
        this.mtu = mtu;
        this.up = false;
    }

    output(data: NetworkData, destination: BaseAddress, rtentry?: DeviceRoute): DeviceResult {
        throw new Error("method not implemented")
    }
    /** Initialize stuff idk but for example dhcp or for loclalhost self assign ip address */
    start(): DeviceResult {
        throw new Error("method not implemented")
    };

    id() {
        return this.name + this.unit
    }
}

export class EthernetInterface extends BaseInterface {
    private target: EthernetInterface | undefined;
    macAddress: MACAddress

    constructor(device: Device2, macAddress: MACAddress) {
        super(device, "eth",
            device.interfaces.reduce((s, { name }) => s + ((name == "eth") as unknown as number), 0),
            1500
        )
        this.macAddress = macAddress;
    }

    output(data: NetworkData, destination: BaseAddress, rtentry?: DeviceRoute<typeof BaseAddress>): DeviceResult<"UDUMB"> {
        if (!this.up || !rtentry || !this.target) {
            return { success: false, error: "UDUMB", message: "interface is eiter not up or a route entry is missing" };
        }

        let etherheader: typeof ETHERNET_HEADER;
        if (destination instanceof IPV4Address) {
            let dmac = this.device.arp_resolve(data, destination, rtentry);
            if (!dmac) {
                // this method will get called recalled at a later times
                return { success: true, data: undefined, message: "the interface is waiting for a LINK_LEVEL destination" };
            }
            etherheader = ETHERNET_HEADER.create({ dmac, ethertype: ETHER_TYPES.IPv4 })
        } else if (destination instanceof IPV6Address) {
            let dmac = this.device.arp_resolve(data, destination, rtentry);
            if (!dmac) {
                // this method will get called recalled at a later times
                return { success: true, data: undefined, message: "the interface is waiting for a LINK_LEVEL destination" };
            }
            etherheader = ETHERNET_HEADER.create({ dmac, ethertype: ETHER_TYPES.IPv6 })
        } else {
            if (destination.buffer.length < ETHERNET_HEADER.getMinSize()) {
                // the header is an invalid size
                return { success: true, data: undefined, error: "UDUMB", message: "the ethernet header added is invalid" };
            }
            etherheader = ETHERNET_HEADER.from(destination.buffer);
        }

        etherheader.set("smac", this.macAddress);
        etherheader.set("payload", data.buffer);

        this.device.log({
            type: "DATA",
            buffer: etherheader.getBuffer(),
            rcvif: this
        }, "SEND")

        if (uint8_equals(etherheader.get("smac").buffer, etherheader.get("dmac").buffer)) {
            // this was meant for myself
            this.device.schedule(() => this.receive(etherheader))
            return { success: true, data: undefined }
        }

        if (etherheader.get("dmac").isBroadcast()) {
            // here i should send to the interface to itself but i don't want that
            // this.device.schedule(() => this.receive(etherheader))
        }

        // somehow put on wire
        this.device.schedule(() => this.target && this.target.receive.call(this.target, etherheader), undefined);
        return { success: true, data: undefined }
    }

    receive_delay = undefined;
    private receive(etherheader: typeof ETHERNET_HEADER) {
        this.device.schedule(() => {
            this.device.log({
                type: "DATA",
                buffer: etherheader.getBuffer(),
                rcvif: this
            }, "RECEIVE");

            this.device.input_ether(etherheader,
                { rcvif: this, buffer: etherheader.getBuffer(), broadcast: etherheader.get("dmac").isBroadcast() });
        }, this.receive_delay)
    }

    onDisconnect?: (iface: EthernetInterface) => void;
    disconnect(): boolean {
        if (!this.target) {
            return true;
        }

        let disconnect = this.target.disconnect.bind(this.target);
        this.target = undefined;

        this.onDisconnect && this.onDisconnect(this);

        this.up = false;
        return disconnect();
    }

    onConnect?: (iface: EthernetInterface) => void;
    connect(target: EthernetInterface) {
        if (this == target) {
            throw new Error("cannot connect to self")
        }

        if (this.target == target) {
            return true;
        }

        this.disconnect();
        this.target = target;

        this.up = true;
        target.connect(this)
        this.onConnect && this.onConnect(this);
    }
}
export class LoopbackInterface extends BaseInterface {
    constructor(device: Device2) {
        super(device, "lo",
            device.interfaces.reduce((s, { name }) => s + ((name == "lo") as unknown as number), 0),
            0xfffe
        )
    }

    output(data: NetworkData, destination: BaseAddress): DeviceResult<"UDUMB"> {
        // based on address determine if ipv4 or ipv6
        data.rcvif = this;

        let ethertype: EtherType;
        if (destination instanceof IPV4Address) {
            ethertype = ETHER_TYPES.IPv4;
        } else if (destination instanceof IPV6Address) {
            ethertype = ETHER_TYPES.IPv6;
        } else {
            // unrecognised address type
            return { success: false, error: "UDUMB", message: "unrecognised address type" };
        }

        let log_data: NetworkData = {
            type: "DATA",
            buffer: ETHERNET_HEADER.create({
                ethertype: ethertype,
                payload: data.buffer

            }).getBuffer(),
            rcvif: this
        }

        this.device.log(log_data, "SEND", false)

        this.device.schedule(() => {
            if (ethertype == ETHER_TYPES.IPv4) {
                this.device.input_ipv4(IPV4_HEADER.from(data.buffer), data)
            } else if (ethertype == ETHER_TYPES.IPv6) {
                this.device.input_ipv6(IPV6_HEADER.from(data.buffer), data)
            }

            this.device.log(log_data, "RECEIVE", true) // Duplicate recording is probably superflous
        })

        return { success: true, data: undefined };
    }
    /** Initialize stuff idk but for example dhcp or for loclalhost self assign ip address */
    start(): DeviceResult<"UDUMB"> {

        this.device.interface_set_address(
            this,
            new IPV4Address("127.0.0.1"),
            createMask(IPV4Address, 8)
        );

        this.device.interface_set_address(
            this,
            new IPV6Address("::1"),
            createMask(IPV6Address, IPV6Address.ADDRESS_LENGTH /* 128 */)
        );

        this.up = true;
        return { success: true, data: undefined };
    };
}