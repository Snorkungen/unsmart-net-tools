import { BaseAddress } from "../address/base";
import { IPV4Address } from "../address/ipv4";
import { ALL_LINK_LOCAL_NODES_ADDRESSV6, IPV6Address } from "../address/ipv6";
import { MACAddress } from "../address/mac";
import { AddressMask, } from "../address/mask";
import { and, not, or } from "../binary";
import { uint8_concat, uint8_equals, uint8_fromNumber, uint8_matchLength, uint8_readUint16BE, uint8_readUint32BE } from "../binary/uint8-array";
import { ETHERNET_DOT1Q_HEADER, ETHERNET_HEADER, ETHER_TYPES } from "../header/ethernet";
import { IPV4_HEADER, IPV4_PSEUDO_HEADER, IPV6_HEADER, IPV6_PSEUDO_HEADER, PROTOCOLS } from "../header/ip";
import { ARP_HEADER, ARP_OPCODES } from "../header/arp";
import { calculateChecksum } from "../binary/checksum";
import { ICMPV4_CODES, ICMPV4_TYPES, ICMPV6_CODES, ICMPV6_TYPES, ICMP_HEADER, ICMP_NDPFLAG_SOLICITED, ICMP_NDP_HEADER, ICMP_UNUSED_HEADER } from "../header/icmp";
import { UDP_HEADER } from "../header/udp";
import { BaseInterface, VlanInterface, EthernetInterface } from "./interface";
import { TCP_FLAGS, TCP_HEADER, TCP_OPTION_KINDS } from "../header/tcp";
import { TCPConnection, TCPState, add_u32, tcp_connection_id, tcp_read_options, tcp_set_option } from "./internals/tcp";
import { DeviceEvent, DeviceEventFilters, DeviceEventHandler, DeviceEventType } from "./internals/event";
import { DeviceResource, DeviceResources } from "./internals/resources";
import { ProgramParameterDefinition } from "./internals/program-parameters";
import { DAEMON_EVENT_OBSERVER } from "./program/event-observer";

// source <https://stackoverflow.com/a/63029283>
export type DropFirst<T extends unknown[]> = T extends [any, ...infer U] ? U : never;

export const _UNSET_ADDRESS_IPV4 = new IPV4Address("0.0.0.0"),
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
    loopback?: boolean;
    broadcast?: boolean;
    multicast?: boolean;
    /** if this device is the final destination for the packet  */
    destination?: boolean;
    rcvif?: BaseInterface;
    /** for future use with some type of interface that pretends to be an ethernet interface */
    rcvif_hwaddress?: BaseAddress;
    /** The data is the last data for a connection instance */
    end_of_data?: true;
    /** configure the outgoing interfaces mode */
    /** if true interface is not allowed to modify data or destination */
    mode_raw?: true,
    allow_unset_saddr?: true,
}

export type DeviceRoute<AddrType extends typeof BaseAddress = typeof BaseAddress> = {
    destination: InstanceType<AddrType>;
    netmask: AddressMask<AddrType>;
    gateway: InstanceType<AddrType>;

    /** this is statically set by a human */
    f_static?: true;
    f_gateway?: true;
    f_host?: true;

    iface: BaseInterface;
}

export class DeviceIO implements DeviceResource {
    abort_controller = new AbortController();

    on_close?: () => void;
    on_flush?: () => void;
    on_write?: (bytes: Uint8Array) => void;

    readers: ((bytes: Uint8Array) => void)[] = [];

    reader_add(reader: DeviceIO["readers"][number]) {
        if (this.abort_controller.signal.aborted) return reader;
        // !NOTE: this thing unshift to allow for a reader to create a reader that does not read the read bytes
        this.readers.unshift(reader);
        return reader;
    }

    reader_remove(reader: DeviceIO["readers"][number]) {
        if (this.abort_controller.signal.aborted) return;
        this.readers = this.readers.filter(v => v != reader);
    }

    read(bytes: Uint8Array) {
        if (this.abort_controller.signal.aborted) return;
        for (let reader of this.readers) {
            reader(bytes);
        }
    }

    flush() {
        if (this.abort_controller.signal.aborted) return;
        if (this.on_flush) {
            this.on_flush();
        }
    }

    write(bytes: Uint8Array) {
        if (this.abort_controller.signal.aborted) return;
        if (this.on_write) {
            this.on_write(bytes);
        }
    }

    close() {
        if (this.abort_controller.signal.aborted) return;
        if (this.on_close) {
            this.on_close();
        }
        this.abort_controller.abort();
        this.readers.length = 0;

        delete this.on_close;
        delete this.on_flush;
        delete this.on_write;
    }
}

export type ContactAF = "RAW" | "IPv4" | "IPv6";
export type ContactProto = "RAW" | "UDP" | "TCP";
export type ContactReceiver<C extends Contact = Contact> = (contact: C, data: NetworkData, caddr?: ContactAddress<BaseAddress>) => void;
export type ContactReceiveOptions = { promiscuous?: true };
type ContactError = unknown; // !TODO: conjure up some type of problems that might occur

export type ContactAddress<Addr extends BaseAddress> = {
    sport: number;
    dport: number;
    saddr: Addr;
    daddr: Addr;
}
type DeviceContactMethod<T extends (...params: any[]) => any> = (contact: Contact, ...params: Parameters<T>) => ReturnType<T>
export interface Contact<AF extends ContactAF = ContactAF, Proto extends ContactProto = ContactProto, AT extends typeof BaseAddress = typeof BaseAddress, Addr extends BaseAddress = InstanceType<AT>> {
    abort_controller: AbortController;

    addressFamily: AF;
    proto: Proto;

    /** address naming is just a placeholder */
    address?: ContactAddress<Addr>;
    root_contact?: Contact;

    /* Methods */
    close(): DeviceResult<ContactError>;
    bind(caddr: ContactAddress<Addr>): DeviceResult<ContactError, typeof caddr>;

    receive(receiver: ContactReceiver<Contact<AF, Proto>>, options?: ContactReceiveOptions): DeviceResult<ContactError>;
    receiveFrom(receiver: ContactReceiver<Contact<AF, Proto>>, caddr: Partial<ContactAddress<Addr>>, options?: ContactReceiveOptions): DeviceResult<ContactError>;

    send(data: NetworkData, destination?: Addr, rtentry?: DeviceRoute<AT>): DeviceResult<ContactError>;
    sendTo(data: NetworkData, caddr?: Partial<ContactAddress<Addr>>, rtentry?: DeviceRoute<AT>): DeviceResult<ContactError>;

    connect(caddr?: Partial<ContactAddress<Addr>>, rtentry?: DeviceRoute<AT>): DeviceResult<ContactError>
    listen(): DeviceResult<ContactError>
    accept(accept_handler: (new_contact: Contact) => boolean): DeviceResult<ContactError>

    /** this method is to allows for, handling of asynchronous errors \
     * There might be a problem with the contact being closed
     */
    on_error(on_error_handler: (contact: Contact, error: DeviceResult<ContactError>) => void): void
}

export type Program<DT = unknown> = {
    name: string;
    init(proc: Process<DT>, args: string[], data?: Partial<DT>): ProcessSignal | Promise<ProcessSignal>;

    description?: string;
    parameters?: ProgramParameterDefinition<any>
    __NODATA__?: true;
}

export enum ProcessSignal {
    EXIT, INTERRUPT, ERROR = ProcessSignal.EXIT,
    /** Explicit means that the user is in charge of closing the process */
    __EXPLICIT__
};
export type ProcessMessageType = ("INFO" | "ERROR")
export type ProcessID = string; // number[] !TODO: it could be an array of numbers becouse then it would make things easier in coding
export type ProcessHandler = (proc: Process, signal: ProcessSignal) => void;
export type ProcessTerminalReadFunc = (proc: Process, bytes: Uint8Array) => void | true;
type ProcessStartHandlers = Partial<{
    on_close: ProcessHandler;
    io_on_write: DeviceIO["on_write"];
    io_on_close: DeviceIO["on_close"];
    io_on_flush: DeviceIO["on_flush"];
}>;
type DeviceProcessMethod<T extends (...params: any[]) => any> = (contact: Process, ...params: Parameters<T>) => ReturnType<T>
export type Process<DT = any> = {
    abort_controller: AbortController;
    status: "UNINIT" | "MARKED_CLOSED" | "RUNNING"
    signal: ProcessSignal;

    id: ProcessID;
    device: Device;
    program: Program;
    data: DT;

    close(status?: ProcessSignal): void;
    spawn<SDT extends any>(program: Program<SDT>, args?: string[], data?: Partial<SDT>, handlers?: ProcessStartHandlers): Process | undefined;
    handle(signal_handler: (proc: Process, signal: ProcessSignal) => void): void

    io: DeviceIO;
    resources: DeviceResources;
};

export type DeviceTerminal = {
    read?: (bytes: Uint8Array) => void;
    write(bytes: Uint8Array): void;
    flush(): void;
}

export function address_is_unset(address: BaseAddress): boolean {
    let sum = 0, i = 0; while (i < address.buffer.byteLength && sum == 0) {
        sum += address.buffer[i++];
    }
    return sum === 0;
}

export function __find_best_caddr_match<CR extends ({ contact: Contact } | undefined)>(af: ContactAF, proto: ContactProto, input_caddr: ContactAddress<BaseAddress>, creceivers: CR[]): CR | undefined {
    let best: CR | undefined = undefined;
    for (let creceiver of creceivers) {
        if (!creceiver || creceiver.contact.addressFamily != af || creceiver.contact.proto != proto) {
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

        if (!address_is_unset(caddr.daddr) && !uint8_equals(caddr.daddr.buffer, input_caddr.daddr.buffer)) {
            continue;
        } else if (!address_is_unset(caddr.saddr) && !uint8_equals(caddr.saddr.buffer, input_caddr.saddr.buffer)) {
            continue;
        }
        if (!best) {
            best = creceiver;
        } else {
            if ((caddr.dport == 0 && best.contact.address?.dport != 0) ||
                (caddr.sport == 0 && best.contact.address?.sport != 0) ||
                (address_is_unset(caddr.daddr) && !address_is_unset(best.contact.address!.daddr)) ||
                (address_is_unset(caddr.saddr) && !address_is_unset(best.contact.address!.saddr))
            ) {
                continue;
            }
            best = creceiver;
        }
    }

    return best;
}

export class Device {
    name = Math.floor(Math.random() * 10_000).toString() + "B2";

    constructor() {
        this.process_start(DAEMON_EVENT_OBSERVER);
    }

    resources = new DeviceResources();

    /* store key-value information about something ... */
    /** NOTE: store should only store simple types as Objects, Arrays, Numbers, Strings */
    private store_data: Record<string, unknown> = {};
    store_get<T extends unknown>(key: string): T | null {
        return (this.store_data[key] as T) ?? null;
    }
    store_set<T extends unknown>(key: string, data: T): T {
        this.store_data[key] = data;
        this.event_dispatch("store_set", key);
        return data;
    }
    store_delete(key: string) {
        delete this.store_data[key];
        this.event_dispatch("store_delete", key);
    }

    private events = new DeviceResources<DeviceEvent>();
    event_create<T extends DeviceEventType>(keys: T[] | T, handler: DeviceEventHandler<T>, ...filters: DeviceEventFilters<T>): DeviceEvent {
        return this.events.create({
            abort_controller: new AbortController(),
            handler: handler as any,
            keys: Array.isArray(keys) ? keys : [keys],
            filters: filters,
            close() {
                if (this.abort_controller.signal.aborted) return;
                this.abort_controller.abort();
                this.keys.length = 0;
                this.filters.length = 0;
            },
        })
    }

    event_dispatch<T extends DeviceEventType>(evt: T, ...params: Parameters<DeviceEventHandler<T>>) {
        for (let event of this.events.items) {
            if (event && event.keys.includes(evt)) {
                if (!event.filters.every((filterv, i) => filterv == params[i])) {
                    continue;
                }
                event.handler(...params);
            }
        }
    }
    /*
    THIS IS RESERVED SPACE FOR PROCESS LOGIC
    
    */
    programs: Program[] = [];
    processes = new DeviceResources<Process>();
    private process_handlers: ({ proc: Process, handler: ProcessHandler, id: ProcessID } | undefined)[] = [];
    private PROCESS_ID_SEPARATOR = ":";

    /** Process start only returns a process if a parent proc is provided */
    process_start<DT extends any>(program: Program<DT>, args?: string[], data?: Partial<DT>): void
    process_start<DT extends any>(program: Program<DT>, args: string[] | undefined, data: Partial<DT> | undefined, parent_proc: Process, handlers?: ProcessStartHandlers): Process | undefined;
    process_start<DT extends any>(program: Program<DT>, args?: string[], data?: Partial<DT>, parent_proc?: Process, handlers?: ProcessStartHandlers): Process | undefined {
        let id: ProcessID = "";
        if (parent_proc) {
            id = parent_proc.id + this.PROCESS_ID_SEPARATOR;
        }

        if (id.length > 100) {
            console.warn("id length too long; this might be caused by a spawn loop");
            return;
        }

        const io = new DeviceIO();
        if (handlers) {
            if (handlers.io_on_close)
                io.on_close = handlers.io_on_close;

            if (handlers.io_on_flush)
                io.on_flush = handlers.io_on_flush;

            if (handlers.io_on_write)
                io.on_write = handlers.io_on_write;
        }

        const proc_resources = new DeviceResources();
        const device = this;
        let id_idx = this.processes.items.indexOf(undefined);
        if (id_idx < 0) id_idx = this.processes.items.length;

        const proc = this.processes.create<Process<DT>>({
            abort_controller: new AbortController(),
            status: "UNINIT",
            signal: ProcessSignal.__EXPLICIT__,

            id: id + program.name + id_idx,
            device: this,
            program: program,
            data: undefined as DT,

            close(...p) { return device.process_close(this, ...p) },
            spawn(...p) { return device.process_spawn(this, ...p) },
            handle(...p) { return device.process_handle(this, ...p) },

            resources: proc_resources,
            io: proc_resources.create(io),
        });


        if (parent_proc && handlers && handlers.on_close) {
            this.process_handle(proc, handlers.on_close, parent_proc.id);
        }

        let init_sig = program.init(proc, args || [], data);
        this.event_dispatch("process_start", proc);

        if (init_sig instanceof Promise) {
            init_sig.then(sig => {
                if (this.process_should_close(proc, sig)) {
                    proc.status = "MARKED_CLOSED";
                    this.process_close(proc, sig);

                    if (!parent_proc) {
                        proc.abort_controller.abort();
                    }
                }
            });
        } else {
            proc.signal = init_sig;

            if (this.process_should_close(proc, init_sig)) {
                proc.status = "MARKED_CLOSED";
                this.process_close(proc, init_sig);

                if (!parent_proc && proc) {
                    proc.abort_controller.abort();
                    return undefined;
                }

                return proc;
            }
        }

        proc.status = "RUNNING";

        if (parent_proc) {
            return proc;
        }

        return undefined;
    }

    private process_should_close<T extends any>(proc: Process<T>, signal: ProcessSignal): boolean {
        if (signal !== ProcessSignal.__EXPLICIT__) {
            return true;
        } else if (typeof proc.data === "undefined" && !proc.program.__NODATA__) {
            // check that data is defined but there needs to be away to silence the message if program does not use data.
            console.warn(proc.program.name, "data not defined! to silence warning set __NODATA__ ");
        }

        return false;
    }

    process_close(proc: Process, signal: ProcessSignal = ProcessSignal.EXIT) {
        if (proc.abort_controller.signal.aborted) {
            return; // to prevent loops 
        } if (proc.status === "UNINIT") {
            proc.status = "MARKED_CLOSED";
            return;
        }

        this.event_dispatch("process_close", proc);

        // just to get a consistent warning
        this.process_should_close(proc, signal);

        // First remove handlers created by the process
        for (let idx in this.process_handlers) {
            let handler = this.process_handlers[idx];
            if (!handler || proc != handler.proc || handler.id != handler.proc.id) continue;
            handler.handler(proc, signal)
            delete this.process_handlers[idx]
        }
        // Second remove handlers created by the parent process
        for (let idx in this.process_handlers) {
            let handler = this.process_handlers[idx];
            if (!handler || proc != handler.proc) continue;
            handler.handler(proc, signal)
            delete this.process_handlers[idx]
        }

        // close spawned processes, abuse the id
        for (let sproc of this.processes.items) {
            if (sproc && sproc.id.startsWith(proc.id + this.PROCESS_ID_SEPARATOR) && sproc.id.length > proc.id.length) {
                this.process_close(sproc, signal);
            }
        }

        proc.resources.close();
        proc.abort_controller.abort();
    }

    process_spawn: DeviceProcessMethod<Process["spawn"]> = (proc, program, args, data, handlers) => {
        return this.process_start(program, args, data, proc, handlers);
    }

    process_handle(proc: Process, handler: ProcessHandler, parent_id?: ProcessID) {
        let i = -1; while (this.process_handlers[++i]) { continue; };
        this.process_handlers[i] = {
            proc: proc,
            handler: handler,
            id: parent_id ? parent_id : proc.id
        }
    }

    private terminal?: DeviceTerminal;
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
        for (let attached_io of this.io_terminal_attached) {
            if (attached_io.abort_controller.signal.aborted) continue;
            attached_io.read(bytes);
        }
    }

    private io_terminal_attached: DeviceIO[] = [];
    io_terminal_attach(io: DeviceIO) {
        const device = this;
        io.on_write = function (bytes) {
            (!this.abort_controller.signal.aborted && device.terminal) && device.terminal.write(bytes);
        }
        io.on_flush = function () {
            (!this.abort_controller.signal.aborted && device.terminal) && device.terminal.flush();
        }
        io.on_close = function () {
            (!this.abort_controller.signal.aborted) && device.io_terminal_detach(this)
        }

        this.io_terminal_attached.push(io);
    }
    io_terminal_detach(io: DeviceIO) {
        delete io.on_write;
        delete io.on_close;
        delete io.on_flush;
        this.io_terminal_attached.filter(v => v != io);
    }

    private input_tcp4(iphdr: typeof IPV4_HEADER, data: NetworkData) {
        if (!data.destination || data.multicast || data.broadcast)
            return;

        let tcphdr = TCP_HEADER.from(iphdr.get("payload"));
        let pseudohdr = IPV4_PSEUDO_HEADER.create({
            saddr: iphdr.get("saddr"),
            daddr: iphdr.get("daddr"),
            proto: PROTOCOLS.TCP,
            len: iphdr.get("len") - (iphdr.get("ihl") << 2)
        });

        if (calculateChecksum(uint8_concat([pseudohdr.getBuffer(), tcphdr.getBuffer()])) !== 0) {
            console.warn("input_tcp4: [bad checksum]")
            return;
        }

        this.contact_input_tcp("IPv4", { ...data, buffer: tcphdr.getBuffer() }, {
            saddr: iphdr.get("daddr"),
            daddr: iphdr.get("saddr"),
            sport: tcphdr.get("dport"),
            dport: tcphdr.get("sport")
        });
    }
    private input_tcp6(iphdr: typeof IPV6_HEADER, data: NetworkData) {
        if (!data.destination || data.multicast || data.broadcast)
            return;

        let tcphdr = TCP_HEADER.from(iphdr.get("payload"));
        let pseudohdr = IPV6_PSEUDO_HEADER.create({
            saddr: iphdr.get("saddr"),
            daddr: iphdr.get("daddr"),
            proto: PROTOCOLS.TCP,
            len: iphdr.get("payloadLength"), // Assume that packet contains no extension headers
        });

        if (calculateChecksum(uint8_concat([pseudohdr.getBuffer(), tcphdr.getBuffer()])) !== 0) {
            console.warn("input_tcp6: [bad checksum]")
            return;
        }

        this.contact_input_tcp("IPv6", { ...data, buffer: tcphdr.getBuffer() }, {
            saddr: iphdr.get("daddr"),
            daddr: iphdr.get("saddr"),
            sport: tcphdr.get("dport"),
            dport: tcphdr.get("sport")
        });
    }

    private input_udp4(iphdr: typeof IPV4_HEADER, data: NetworkData) {
        if (!data.destination)
            return; // if it is not the destination then this is an unnecessary check

        let udphdr = UDP_HEADER.from(iphdr.get("payload"));

        if (udphdr.get("csum") > 0) {
            let pseudohdr = IPV4_PSEUDO_HEADER.create({
                saddr: iphdr.get("saddr"),
                daddr: iphdr.get("daddr"),
                proto: PROTOCOLS.UDP,
                len: udphdr.size
            });

            if (calculateChecksum(uint8_concat([pseudohdr.getBuffer(), udphdr.getBuffer()])) !== 0) {
                console.warn("input_udp4: [bad checksum]")
                return;
            }
        }

        if (!this.contact_input_udp("IPv4", { ...data, buffer: udphdr.get("payload") }, {
            saddr: iphdr.get("daddr"),
            daddr: iphdr.get("saddr"),
            sport: udphdr.get("dport"),
            dport: udphdr.get("sport")
        }) && !(data.multicast || data.broadcast) && data.destination) {
            // Reply with an icmp error (UNREACHABLE_PORT)
            let icmphdr = ICMP_HEADER.create({
                type: ICMPV4_TYPES.DESTINATION_UNREACHABLE,
                code: ICMPV4_CODES[ICMPV4_TYPES.DESTINATION_UNREACHABLE].UNREACHABLE_PORT,
                data: ICMP_UNUSED_HEADER.create({
                    data: iphdr.getBuffer().slice(0, 64)
                }).getBuffer(),
                csum: 0,
            });

            let reply_destination = iphdr.get("saddr")

            icmphdr.set("csum", calculateChecksum(icmphdr.getBuffer()))
            iphdr = IPV4_HEADER.create({
                daddr: reply_destination,
                saddr: iphdr.get("daddr"),
                proto: PROTOCOLS.ICMP,
                payload: icmphdr.getBuffer()
            });

            this.output_ipv4({
                buffer: iphdr.getBuffer()
            }, reply_destination); // ignore problems
        }
    }

    private input_udp6(iphdr: typeof IPV6_HEADER, data: NetworkData) {
        let udphdr = UDP_HEADER.from(iphdr.get("payload"));
        let pseudohdr = IPV6_PSEUDO_HEADER.create({
            saddr: iphdr.get("saddr"),
            daddr: iphdr.get("daddr"),
            proto: PROTOCOLS.UDP,
            len: udphdr.size
        });

        if (calculateChecksum(uint8_concat([pseudohdr.getBuffer(), udphdr.getBuffer()])) !== 0) {
            console.warn("input_udp6: [bad checksum]")
            return;
        }

        if (!this.contact_input_udp("IPv6", { ...data, buffer: udphdr.get("payload") }, {
            saddr: iphdr.get("daddr"),
            daddr: iphdr.get("saddr"),
            sport: udphdr.get("dport"),
            dport: udphdr.get("sport")
        }) && !(data.multicast || data.broadcast) && data.destination) {
            // Reply with an icmp error (UNREACHABLE_PORT)
            let icmphdr = ICMP_HEADER.create({
                type: ICMPV6_TYPES.DESTINATION_UNREACHABLE,
                code: ICMPV6_CODES[ICMPV6_TYPES.DESTINATION_UNREACHABLE].PORT_UNREACHABLE,
                data: ICMP_UNUSED_HEADER.create({ data: iphdr.getBuffer().slice(0, 64 * 4) }).getBuffer()
            });

            let route = this.route_resolve(iphdr.get("saddr"));
            if (!route) return;
            let source = route.iface.addresses.find(a => a.address instanceof IPV6Address)
            if (!source) return;

            let reply_destination = iphdr.get("saddr")

            let pseudohdr = IPV4_PSEUDO_HEADER.create({
                saddr: source.address,
                daddr: reply_destination,
                proto: PROTOCOLS.IPV6_ICMP,
                len: icmphdr.size
            });

            icmphdr.set("csum", calculateChecksum(uint8_concat([pseudohdr.getBuffer(), icmphdr.getBuffer()])))

            iphdr = IPV6_HEADER.create({
                daddr: reply_destination,
                nextHeader: PROTOCOLS.IPV6_ICMP,
                payload: icmphdr.getBuffer(),
            });

            this.output_ipv6({
                buffer: iphdr.getBuffer()
            }, reply_destination); // ignore problems
        };
    }

    private input_ndp(iphdr: typeof IPV6_HEADER, data: NetworkData) {
        if (!data.rcvif || data.loopback || data.rcvif.header != ETHERNET_HEADER || !(data.rcvif_hwaddress instanceof MACAddress)) {
            return;
        }

        let icmphdr = ICMP_HEADER.from(iphdr.get("payload")),
            ndphdr = ICMP_NDP_HEADER.from(icmphdr.get("data")),
            ethhdr = ETHERNET_HEADER.from(data.buffer);

        if (icmphdr.get("type") === ICMPV6_TYPES.NEIGHBOR_ADVERTISMENT) {
            this.arp_cache_entry(ndphdr.get("targetAddress"), {
                neighbor: iphdr.get("saddr"),
                iface: data.rcvif,
                macAddress: ethhdr.get("smac"),
                createdAt: Date.now()
            });
            return;
        } else if (icmphdr.get("type") !== ICMPV6_TYPES.NEIGHBOR_SOLICITATION) {
            return; // this check is redundant but here to signal that the following text is handling NDP SOLICITATION
        }

        if (!data.destination)
            return; // this device is not the final destination

        let iface = this.interfaces.find(({ addresses }) => addresses.find(({ address }) => uint8_equals(address.buffer, ndphdr.get("targetAddress").buffer)))
        if (!iface) {
            return
        }
        let saddr = iface.addresses.find(({ address }) => uint8_equals(address.buffer, ndphdr.get("targetAddress").buffer))?.address,
            daddr = iphdr.get("saddr");
        if (!saddr) return; // this should not happen due to the previous check


        // this might not be the correct way of doing this but in fantasy-land this goes
        if (true) {  // optimisation to set an entry for the requester
            this.arp_cache_entry(iphdr.get("saddr"), {
                neighbor: ndphdr.get("targetAddress"),
                iface: data.rcvif,
                macAddress: ethhdr.get("smac"),
                createdAt: Date.now()
            });
        }

        // reply to ndp Request
        ndphdr.set("reserved", ICMP_NDPFLAG_SOLICITED); // Solicited flag set
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
            smac: data.rcvif_hwaddress,
            ethertype: ETHER_TYPES.IPv6
        }).getBuffer()))
    }

    private input_icmp6(iphdr: typeof IPV6_HEADER, data: NetworkData) {
        let icmphdr = ICMP_HEADER.from(iphdr.get("payload"));

        let pseudohdr = IPV6_PSEUDO_HEADER.create({
            saddr: iphdr.get("saddr"), daddr: iphdr.get("daddr"), len: icmphdr.size, proto: PROTOCOLS.IPV6_ICMP,
        });

        if (calculateChecksum(uint8_concat([pseudohdr.getBuffer(), icmphdr.getBuffer()])) !== 0) {
            console.warn("input_icmp6: [bad checksum]")
            return;
        }

        if (icmphdr.get("type") < 128) {
            // this is an error 
            // do some stuff
        }

        switch (icmphdr.get("type")) {
            case ICMPV6_TYPES.NEIGHBOR_ADVERTISMENT:
            case ICMPV6_TYPES.NEIGHBOR_SOLICITATION:
                this.input_ndp(iphdr, data); break;
        }
    }

    private input_icmp4(iphdr: typeof IPV4_HEADER, data: NetworkData) {
        let icmphdr = ICMP_HEADER.from(iphdr.get("payload"));

        if (calculateChecksum(icmphdr.getBuffer()) !== 0) {
            // checksum failed
            console.warn("input_icmp4: [bad checksum]")
            return;
        }

        if (
            icmphdr.get("type") === ICMPV4_TYPES.DESTINATION_UNREACHABLE ||
            icmphdr.get("type") === ICMPV4_TYPES.TIME_EXCEEDED ||
            icmphdr.get("type") === ICMPV4_TYPES.PARAMETER_PROBLEM
        ) {

            // !TODO: handle errors and pass to interested parties
        }

    }

    input_ipv6(iphdr: typeof IPV6_HEADER, data: NetworkData) {
        if (!data.rcvif) { console.warn("rcvif missing"); return }

        let daddr = iphdr.get("daddr")
        data.multicast = daddr.isMulticast();

        if (data.loopback) {
            data.destination = true; // it is looped back IT IS for this device
        } else if (data.multicast) {
            data.destination = this.interfaces_mcast_subscriptions[data.rcvif.id()].some((addr) => (daddr.constructor == addr.constructor) && uint8_equals(addr.buffer, daddr.buffer));

            // for now assume that all multicasts are FF01:0:0:0:0:0:0:1 A.K.A. ALL_NODES
            data.destination = true; // REMEMBER, THIS IS TEMPORARY
        } else {
            data.destination = false; // this could have been set by lower level things
            daddr_check: for (let iface of this.interfaces) for (let source of iface.addresses) {
                if (source.address.constructor != daddr.constructor) continue;
                if (uint8_equals(source.address.buffer, daddr.buffer)) {
                    data.destination = true;
                    break daddr_check;
                }
            }
        }

        // ensure that buffer is the size the ip header specifies
        iphdr = iphdr.from(
            iphdr.getBuffer().subarray(0, iphdr.getMinSize() + iphdr.get("payloadLength"))
        );

        this.contact_input_raw("IPv6", { ...data, buffer: iphdr.getBuffer() });

        switch (iphdr.get("nextHeader")) {
            case PROTOCOLS.IPV6_ICMP: return this.input_icmp6(iphdr, data);
            case PROTOCOLS.UDP: return this.input_udp6(iphdr, data);
            case PROTOCOLS.TCP: return this.input_tcp6(iphdr, data);
        }
    }

    input_ipv4(iphdr: typeof IPV4_HEADER, data: NetworkData) {
        if (!data.rcvif) { console.warn("rcvif missing"); return }
        if (calculateChecksum(iphdr.getBuffer().slice(0, iphdr.get("ihl") << 2)) != 0) {
            // checksum failed
            console.warn("input_ipv4: [bad checksum]")
            return;
        }

        if ((iphdr.get("flags") & (1 << 2)) < 0) {
            throw "ipv4 fragments not supported"
        }

        let daddr = iphdr.get("daddr")
        if (data.loopback) {
            data.destination = true; // it is looped back IT IS for this device
        } else if (daddr.toString() == "255.255.255.255") { // all hosts broadcst
            data.broadcast = true;
            data.destination = true;
        } else if ((daddr.buffer[0] & 0xe0) == 0xe0 /* Match class D address */) {
            data.multicast = true;
            data.destination = this.interfaces_mcast_subscriptions[data.rcvif.id()].some((addr) => (daddr.constructor == addr.constructor) && uint8_equals(addr.buffer, daddr.buffer));
        } else {
            data.destination = false; // this could have been set by lower level things
            daddr_check: for (let iface of this.interfaces) for (let source of iface.addresses) {
                if (source.address.constructor != daddr.constructor)
                    continue

                if (uint8_equals(source.address.buffer, daddr.buffer)) {
                    data.destination = true;
                    break daddr_check;
                }

                if (uint8_equals(
                    or(source.address.buffer, not(source.netmask.buffer)), // subnet broadcast address
                    daddr.buffer
                )) {
                    data.broadcast = true;
                    data.destination = true;
                    break daddr_check;
                }
            }
        }

        // ensure that buffer is the size the ip header specifies
        iphdr = iphdr.from(
            iphdr.getBuffer().subarray(0, iphdr.get("len"))
        );

        this.contact_input_raw("IPv4", { ...data, buffer: iphdr.getBuffer() });

        switch (iphdr.get("proto")) {
            case PROTOCOLS.ICMP:
                return this.input_icmp4(iphdr, data);
            case PROTOCOLS.UDP:
                return this.input_udp4(iphdr, data);
            case PROTOCOLS.TCP:
                return this.input_tcp4(iphdr, data);
        }
    }

    input_arp(etherheader: typeof ETHERNET_HEADER, data: NetworkData) {
        if (!data.rcvif || data.loopback || data.rcvif.header != ETHERNET_HEADER || !(data.rcvif_hwaddress instanceof MACAddress)) return;

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
            let tpa = arpHdr.get("tpa");

            let iface = this.interfaces.find(({ addresses }) => addresses.find(({ address }) => uint8_equals(address.buffer, tpa.buffer)))
            if (!iface) {
                return
            }

            let replyARPHdr = arpHdr.create({
                oper: ARP_OPCODES.REPLY,
                tha: data.rcvif_hwaddress
            }), replyEthHdr = ETHERNET_HEADER.create({
                dmac: etherheader.get("smac"),
                smac: data.rcvif_hwaddress,
                ethertype: ETHER_TYPES.ARP
            })

            rcvif.output({
                buffer: replyARPHdr.getBuffer()
            }, new BaseAddress(replyEthHdr.getBuffer()));


            if (true) { // optimisation to set an entry for the requester
                if (address_is_unset(arpHdr.get("spa")))
                    return; // not source protocol address set
                else if (address_is_unset(arpHdr.get("tpa")))
                    return

                this.arp_cache_entry(arpHdr.get("spa"), {
                    neighbor: arpHdr.get("tpa"),
                    iface: data.rcvif,
                    macAddress: etherheader.get("smac"),
                    createdAt: Date.now()
                });
            }
        }
    }

    input_vlan(etherheader: typeof ETHERNET_HEADER, data: NetworkData) {
        if (!data.rcvif) { console.warn("rcvif missing"); return };
        if (data.rcvif.header != ETHERNET_HEADER || !(data.rcvif_hwaddress instanceof MACAddress)) return;

        if (etherheader.get("ethertype") != ETHER_TYPES.VLAN)
            return;

        let vlanhdr = ETHERNET_DOT1Q_HEADER.from(etherheader.get("payload"));

        for (let iface of this.interfaces) {
            if (!(iface instanceof VlanInterface))
                continue;

            if (vlanhdr.get("vid") != iface.vid)
                continue;

            iface.input(etherheader, data);
        }
    }

    input_ether(etherframe: typeof ETHERNET_HEADER, data: NetworkData) {
        if (!data.rcvif || data.rcvif.header !== ETHERNET_HEADER) {
            throw new Error("rcvif missing or wrong type, rcvif must be a EthernetInterface")
        }

        // check for destination
        let dmac = etherframe.get("dmac")
        if (data.broadcast || dmac.isBroadcast()) {
            data.broadcast = true; data.destination = true;
        } else if (data.multicast || dmac.isMulticast()) {
            data.multicast = true;
            data.destination = this.interfaces_mcast_subscriptions[data.rcvif.id()]
                .some((addr) => (dmac.constructor == addr.constructor) && uint8_equals(addr.buffer, dmac.buffer));
        } else if (dmac.isUnicast()) {
            data.destination = data.rcvif_hwaddress && uint8_equals(data.rcvif_hwaddress?.buffer, dmac.buffer);
        }

        this.contact_input_raw("RAW", data);

        if (etherframe.get("ethertype") == ETHER_TYPES.IPv4) {
            this.input_ipv4(
                IPV4_HEADER.from(etherframe.get("payload")), data)
        } else if (etherframe.get("ethertype") == ETHER_TYPES.IPv6) {
            this.input_ipv6(
                IPV6_HEADER.from(etherframe.get("payload")), data)
        } else if (etherframe.get("ethertype") == ETHER_TYPES.ARP) {
            this.input_arp(etherframe, data)
        } else if (etherframe.get("ethertype") == ETHER_TYPES.VLAN) { // !TODO: in future support for S_VLAN
            this.input_vlan(etherframe, data)
        }

    }

    /** data.buffer contains the pseudo_header followed by the tcp header */
    private output_tcp(data: NetworkData, destination: BaseAddress, route?: DeviceRoute): DeviceResult<"HOSTUNREACH" | "ERROR"> {
        if (!route && !(route = this.route_resolve(destination))) return {
            success: false,
            error: "HOSTUNREACH",
            message: "No outgoing route found"
        }

        let source = route.iface.addresses.find(value => value.address.constructor == destination.constructor);
        let pseudo_header: typeof IPV4_PSEUDO_HEADER | typeof IPV6_PSEUDO_HEADER, tcphdr: typeof TCP_HEADER;

        if (destination instanceof IPV4Address) {
            pseudo_header = IPV4_PSEUDO_HEADER.from(data.buffer.subarray(0, IPV4_PSEUDO_HEADER.size));
            tcphdr = TCP_HEADER.from(data.buffer.slice(pseudo_header.size));
            {
                if (address_is_unset(pseudo_header.get("daddr"))) {
                    pseudo_header.set("daddr", destination);
                }

                if (address_is_unset(pseudo_header.get("saddr"))) { // if there's no source set; use the outgoing interfaces ip addressping 
                    // select an address from the outgoing interface
                    if (!source) {
                        return {
                            success: false,
                            error: "HOSTUNREACH",
                            message: "no source address for interface found"
                        }
                    }

                    pseudo_header.set("saddr", source.address);
                }
            }
        } else if (destination instanceof IPV6Address) {
            pseudo_header = IPV6_PSEUDO_HEADER.from(data.buffer.subarray(0, IPV6_PSEUDO_HEADER.size));
            tcphdr = TCP_HEADER.from(data.buffer.slice(pseudo_header.size));
            {
                if (address_is_unset(pseudo_header.get("daddr"))) {
                    pseudo_header.set("daddr", destination);
                }

                if (address_is_unset(pseudo_header.get("saddr"))) {
                    if (!source) {
                        return {
                            success: false,
                            error: "HOSTUNREACH",
                            message: "no source address for interface found"
                        }
                    }

                    pseudo_header.set("saddr", source.address as IPV6Address);
                }
            }
        } else {
            return { success: false, error: "ERROR" }
        }

        // !NOTE: the following cannot know about options options would be,
        if (tcphdr.get("doffset") === 0) { tcphdr.set("doffset", TCP_HEADER.size >> 2) };

        pseudo_header.set("proto", PROTOCOLS.TCP);
        pseudo_header.set("len", tcphdr.size);

        tcphdr.set("csum", 0);
        tcphdr.set("csum", calculateChecksum(uint8_concat([pseudo_header.getBuffer(), tcphdr.getBuffer()])));

        if (destination instanceof IPV4Address) return this.output_ipv4({
            ...data, buffer: IPV4_HEADER.create({
                daddr: pseudo_header.get("daddr"),
                saddr: pseudo_header.get("saddr"),
                proto: pseudo_header.get("proto"),
                payload: tcphdr.getBuffer()
            }).getBuffer()
        }, destination, route);

        if (destination instanceof IPV6Address) return this.output_ipv6({
            ...data, buffer: IPV6_HEADER.create({
                daddr: pseudo_header.get("daddr") as typeof destination,
                saddr: pseudo_header.get("saddr") as typeof destination,
                nextHeader: pseudo_header.get("proto"),
                payload: tcphdr.getBuffer()
            }).getBuffer()
        }, destination, route);

        return { success: false, error: "ERROR" };
    }

    output_ipv6(data: NetworkData, destination: IPV6Address, route?: DeviceRoute): DeviceResult<"HOSTUNREACH" | "ERROR"> {
        if (address_is_unset(destination)) {
            return {
                success: false,
                error: "HOSTUNREACH",
                message: "bad destination",
            }
        }

        // Select route
        if (!route && !(route = this.route_resolve(destination))) return {
            success: false,
            error: "HOSTUNREACH",
            message: "No outgoing route found"
        }

        if (data.buffer.length < IPV6_HEADER.getMinSize()) return { success: false, error: "ERROR", message: "bad header" };
        let iphdr = IPV6_HEADER.from(data.buffer);

        iphdr.set("version", 6);
        // flow label something maybe i don't know
        const DEFAULT_TTL = 64; iphdr.set("hopLimit", iphdr.get("hopLimit") || DEFAULT_TTL);
        iphdr.set("payloadLength", iphdr.get("payload").byteLength);

        if (address_is_unset(iphdr.get("daddr"))) {
            iphdr.set("daddr", destination);
        }

        if (address_is_unset(iphdr.get("saddr"))) { // if there's no source set; use the outgoing interfaces ip address
            // select an address from the outgoing interface
            let source = route.iface.addresses.find(value => value.address.constructor == destination.constructor);
            if (!source) return {
                success: false,
                error: "HOSTUNREACH",
                message: "no source address for interface found"
            }

            iphdr.set("saddr", source.address as IPV6Address);
        }

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

        // !TODO: this could check all addresses on the device if its for the device
        if (route.iface.addresses.find(a => uint8_equals(a.address.buffer, destination.buffer))) {
            return this.output_loopback(data, destination, route);
        }

        let res = route.iface.output(data, destination, route);
        return {
            success: res.success,
            error: res.error ? "ERROR" : undefined,
            data: res.data
        }
    }

    output_ipv4(data: NetworkData, destination: IPV4Address, route?: DeviceRoute): DeviceResult<"HOSTUNREACH" | "ERROR"> {
        /** So the thinking is that the user would construct the iphdr */
        if (address_is_unset(destination)) {
            return {
                success: false,
                error: "HOSTUNREACH",
                message: "bad destination",
            }
        }
        // Select route
        if (!route && !(route = this.route_resolve(destination))) return {
            success: false,
            error: "HOSTUNREACH",
            message: "No outgoing route found"
        }

        //  I'm unsure of how i want to access the outgoing data and if the iphdr has all the requisite data
        if (data.buffer.length < IPV4_HEADER.getMinSize()) return { success: false, error: "ERROR", message: "bad header" };
        let iphdr = IPV4_HEADER.from(data.buffer);

        iphdr.set("version", 4);
        iphdr.set("ihl", iphdr.get("ihl") || iphdr.getMinSize() >> 2); // the user can set the ihl
        iphdr.set("tos", 0);
        const DEFAULT_TTL = 64; iphdr.set("ttl", iphdr.get("ttl") || DEFAULT_TTL);
        iphdr.set("len", iphdr.getBuffer().byteLength);

        if (address_is_unset(iphdr.get("daddr"))) {
            iphdr.set("daddr", destination);
        }

        if (address_is_unset(iphdr.get("saddr")) && !data.allow_unset_saddr) { // if there's no source set; use the outgoing interfaces ip addressping 
            // select an address from the outgoing interface
            let source = route.iface.addresses.find(value => value.address.constructor == destination.constructor);
            if (!source) return {
                success: false,
                error: "HOSTUNREACH",
                message: "no source address for interface found"
            }

            iphdr.set("saddr", source.address);

            // put some thinking to if the destination is a broadcast address
            let broadcast = uint8_readUint32BE(not(or(source.netmask.buffer, iphdr.get("daddr").buffer))) === 0;
            if (broadcast) { data.broadcast = broadcast }
        }

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

        // !TODO: this could check all addresses on the device if its for the device
        if (route.iface.addresses.find(a => uint8_equals(a.address.buffer, destination.buffer))) {
            return this.output_loopback(data, destination, route);
        }

        let res = route.iface.output(data, destination, route);

        return {
            success: res.success,
            error: res.error ? "ERROR" : undefined,
            data: res.data
        }
    }

    output_loopback(data: NetworkData, destination: BaseAddress, route?: DeviceRoute): DeviceResult<"HOSTUNREACH" | "ERROR"> {
        if (!route)
            return { success: false, error: "ERROR" };

        // loopback
        data = { ...data, rcvif: route.iface, loopback: true };

        if (destination instanceof IPV4Address) this.resources.create(this.schedule(() => {
            this.event_dispatch(
                "interface_loopback",
                route.iface,
                { ...data, buffer: ETHERNET_HEADER.create({ ethertype: ETHER_TYPES.IPv4, payload: data.buffer }).getBuffer() })

            this.input_ipv4(IPV4_HEADER.from(data.buffer), data);
        })); else if (destination instanceof IPV6Address) this.resources.create(this.schedule(() => {
            this.event_dispatch(
                "interface_loopback",
                route.iface,
                { ...data, buffer: ETHERNET_HEADER.create({ ethertype: ETHER_TYPES.IPv6, payload: data.buffer }).getBuffer() })
            this.input_ipv6(IPV6_HEADER.from(data.buffer), data);
        })); else {
            // !TODO: check for iface header and proceed accordingly
            return { success: !data.broadcast, error: "HOSTUNREACH", data: undefined }
        }

        return { success: !data.broadcast, error: "ERROR", data: undefined };
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

        // rtentry.f_gateway = undefined; // this is hacky but logically it should be reasonable

        if (destination instanceof IPV4Address) {
            this.arp_enqueue(data, destination, rtentry);
            // send away arp request
            for (let iface of this.interfaces) {
                // TODO: use BaseInterface.header and data.rcvif_hwaddress instead in the future
                if (iface.header !== ETHERNET_HEADER || !iface.up) {
                    continue
                }

                let source = iface.addresses.find(({ address }) => address instanceof IPV4Address);
                if (!source || !source.netmask.compare(source.address, destination)) {
                    continue
                }

                let sha: MACAddress | undefined = undefined;
                if (iface instanceof EthernetInterface) {
                    sha = iface.macAddress
                }

                let arpHeader = ARP_HEADER.create({
                    htype: 1,
                    ptype: ETHER_TYPES.IPv4,
                    hlen: 6,
                    plen: 4,

                    oper: ARP_OPCODES.REQUEST,
                    sha: sha,
                    spa: source.address,
                    tpa: destination
                })

                // wrap packet in ethernet frame
                iface.output({
                    buffer: arpHeader.getBuffer(),
                    broadcast: true
                }, new BaseAddress(ETHERNET_HEADER.create({
                    dmac: new MACAddress("ff:ff:ff:ff:ff:ff"),
                    smac: undefined, // this gets overwritten by the outgoing ethernet interface
                    ethertype: ETHER_TYPES.ARP,
                }).getBuffer()))
            }
        } else if (destination instanceof IPV6Address) {
            this.arp_enqueue(data, destination, rtentry);
            for (let iface of this.interfaces) {
                if (iface.header !== ETHERNET_HEADER || !iface.up) continue;

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
                    buffer: ipv6Hdr.getBuffer(),
                    broadcast: true
                }, new BaseAddress(ETHERNET_HEADER.create({
                    dmac: new MACAddress("ff:ff:ff:ff:ff:ff"),
                    smac: undefined, // this gets set byte the output interface
                    ethertype: ETHER_TYPES.IPv6,
                }).getBuffer()))
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
    arp_invalidate_cache(iface: BaseInterface) {
        for (let [key, ne] of this.arp_cache.entries()) {
            if (ne.iface != iface) continue;
            this.arp_cache.delete(key);
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
    /** interfaces multicast subscriptions */
    interfaces_mcast_subscriptions: Record<string, BaseAddress[]> = {};
    // interface_add and interface_remove defined so that if further devices have som type extra configuration they want to do
    interface_add<F extends BaseInterface>(iface: F): F {
        this.interfaces.push(iface);
        this.interfaces_mcast_subscriptions[iface.id()] = [];
        this.event_dispatch("interface_add");
        return iface
    };
    interface_remove(iface: BaseInterface) {
        delete this.interfaces_mcast_subscriptions[iface.id()];

        this.routes = this.routes.filter((route) => route.iface != iface);
        this.event_dispatch("interface_route_remove", iface);
        iface.addresses.length = 0;
        this.event_dispatch("interface_address_remove", iface);

        iface.disconnect()
        iface.resources.close();
        // @ts-expect-error
        delete iface.device
        iface.up = false;
        this.interfaces = this.interfaces.filter(f => f != iface)

        // !NOTE: network-map relies upon the fact that this gets dispatched after being removed from interfaces
        this.event_dispatch("interface_remove")
    };
    interface_address_remove<AT extends typeof BaseAddress>(iface: BaseInterface, address: InstanceType<AT>): DeviceResult {
        let addridx = iface.addresses.findIndex(value => value.address.constructor == address.constructor && uint8_equals(value.address.buffer, address.buffer));
        if (addridx < 0) {
            return { success: false, data: undefined, message: "address not found" };
        }

        const { netmask } = iface.addresses[addridx];
        let empty_gateway = new BaseAddress(new Uint8Array(address.buffer.length));
        this.interface_route_remove(iface, netmask.mask(address), netmask, empty_gateway, false)

        /* Remove address */
        iface.addresses = iface.addresses.filter((_, i) => i != addridx);
        this.event_dispatch("interface_address_remove", iface);
        return { success: true, data: undefined };
    }
    interface_address_set<AT extends typeof BaseAddress>(iface: BaseInterface, address: InstanceType<AT>, netmask: AddressMask<AT>): DeviceResult {
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

        this.event_dispatch("interface_address_set", iface);

        // 5th: check if a route for the network exists, if not add a new route
        this.interface_route_set(iface, rt_destination as InstanceType<AT>, netmask, rt_gateway as InstanceType<AT>);

        return {
            success: true,
            data: undefined
        }
    }

    interface_route_set<AT extends typeof BaseAddress>(iface: BaseInterface, destination: InstanceType<AT>, netmask: AddressMask<AT>, gateway: InstanceType<AT>, flags: Partial<DeviceRoute> = {}): DeviceResult {
        let i = this.routes.findIndex((route) => (
            route.iface === iface &&
            uint8_equals(route.destination.buffer, destination.buffer) &&
            uint8_equals(route.netmask.buffer, netmask.buffer) &&
            uint8_equals(route.gateway.buffer, gateway.buffer)
        ));

        if (i < 0) {
            this.routes.push({
                iface: iface,
                destination: destination,
                netmask: netmask,
                gateway: gateway,

                f_gateway: !address_is_unset(gateway) || undefined,
                f_host: (netmask.length == netmask.address.ADDRESS_LENGTH) || undefined,
                f_static: flags.f_static,
            });
        } else if (flags.f_static && !this.routes[i].f_static) {
            this.routes[i].f_static = flags.f_static;
        } else {
            return { success: false, data: undefined };
        }

        this.event_dispatch("interface_route_set", iface);

        return { success: true, data: undefined };
    }

    interface_route_remove<AT extends typeof BaseAddress>(iface: BaseInterface, destination: InstanceType<AT>, netmask?: AddressMask<AT>, gateway?: InstanceType<AT>, remove_static?: boolean): DeviceResult {
        let routes = this.routes.filter((route) => (route.iface == iface &&
            uint8_equals(route.destination.buffer, destination.buffer) &&
            (!netmask || uint8_equals(route.netmask.buffer, netmask.buffer)) &&
            (!gateway || uint8_equals(route.gateway.buffer, gateway.buffer))
        ));

        if (routes.length == 0) {
            return { success: false, error: undefined, message: "no route found" };
        } else if (routes.length > 1) {
            return { success: false, error: undefined, message: "multiple routes found, specify" };
        }

        if (!remove_static && routes[0].f_static) {
            return { success: false, error: undefined, message: "could not remove a static route" };
        }

        this.routes = this.routes.filter((route) => route != routes[0]);

        this.event_dispatch("interface_route_remove", iface);

        return { success: true, data: undefined }
    }

    interface_mcast_subscribe(iface: BaseInterface, address: BaseAddress): DeviceResult {
        // !TODO: add a route to allow for the sending to multicast destinations
        if (!(address instanceof MACAddress)) {
            throw new Error("multicast not supported")
        }

        this.interfaces_mcast_subscriptions[iface.id()].push(address);
        this.event_dispatch("interface_mcast_subscribe", iface);
        return { success: true, data: undefined };
    }
    interface_mcast_unsubscribe(iface: BaseInterface, address: BaseAddress): DeviceResult {
        this.interfaces_mcast_subscriptions[iface.id()] = this.interfaces_mcast_subscriptions[iface.id()].filter(addr => addr.constructor != address.constructor || !uint8_equals(addr.buffer, address.buffer));
        this.event_dispatch("interface_mcast_unsubscribe", iface);
        return { success: true, data: undefined };
    }

    /** Returns wheter frame should be dropped */
    interface_filter(iface: BaseInterface, data: NetworkData): boolean {
        if (iface.header == ETHERNET_HEADER && (data.rcvif_hwaddress instanceof MACAddress)) {
            let etherheader = ETHERNET_HEADER.from(data.buffer), dmac = etherheader.get("dmac");

            if (dmac.isBroadcast()) {
                return false
            }

            if (dmac.isUnicast() && uint8_equals(data.rcvif_hwaddress.buffer, dmac.buffer)) {
                return false
            }

            // check for a promiscous listener...
            if (this.contact_receivers.find(v => v?.contact.addressFamily === "RAW" && v.options.promiscuous)) {
                return false;
            }

            // consider VlanInterfaces 
            if (!(iface instanceof VlanInterface) && etherheader.get("ethertype") == ETHER_TYPES.VLAN) {
                // read vlan header ...
                let vlanhdr = ETHERNET_DOT1Q_HEADER.from(etherheader.get("payload"));
                let vid = vlanhdr.get("vid");
                let vlanif: VlanInterface | undefined = undefined;

                for (let v of this.interfaces) if (v instanceof VlanInterface && v.vid == vid) {
                    vlanif = v;
                    break
                }

                if (vlanif && !this.interface_filter(vlanif, data)) {
                    return false; // there exists a vlan-interface that will accept the incoming frame
                }
            }

            let matched = false; // Check multicast messages
            for (let addr of this.interfaces_mcast_subscriptions[iface.id()]) {
                if (matched = (dmac.constructor == addr.constructor) && uint8_equals(dmac.buffer, addr.buffer))
                    break
            }

            return !matched;
        }

        return false
    }

    /** this is to ensure that contacts get given unique ephemeral ports */
    private contact_ephemport = 4001
    private contacts = new DeviceResources<Contact>();
    private contact_receivers: ({ receiver: ContactReceiver, contact: Contact, options: ContactReceiveOptions } | undefined)[] = [];
    private contact_error_handlers = new Array<[Contact, handler: Parameters<Contact["on_error"]>[0]]>()
    contact_create<CAF extends ContactAF, CProto extends ContactProto>(addressFamily: CAF, proto: CProto): DeviceResult<ContactError, Contact<CAF, CProto>> {
        // do some rules checking
        if (addressFamily === "RAW" && proto !== "RAW") {
            return { success: false, error: "", message: "AF cannot be RAW when the proto is something other that RAW" }
        }

        // methods for sending and doing stuff
        let m_close: DeviceContactMethod<Contact["close"]>,
            m_send: DeviceContactMethod<Contact["send"]>,
            m_sendTo: DeviceContactMethod<Contact["sendTo"]>,
            m_receiveFrom: DeviceContactMethod<Contact["receiveFrom"]>,
            m_connect: DeviceContactMethod<Contact["connect"]>,
            m_listen: DeviceContactMethod<Contact["listen"]>,
            m_accept: DeviceContactMethod<Contact["accept"]>;

        m_close = this.contact_close;
        m_connect = this.contact_method_not_supported;
        m_listen = this.contact_method_not_supported;
        m_accept = this.contact_method_not_supported;

        m_sendTo = this.contact_method_not_supported;
        m_receiveFrom = this.contact_method_not_supported;

        if (proto == "RAW") {
            m_send = this.contact_m_send_raw;
        } else if (proto == "UDP") {
            m_send = this.contact_m_send_udp;
            m_sendTo = this.contact_m_sendTo_udp;
            m_receiveFrom = this.contact_m_receiveFrom_udp;
        } else if (proto == "TCP") {
            m_close = this.contact_m_close_tcp;
            m_send = this.contact_m_send_tcp;
            m_connect = this.contact_m_connect_tcp;
            m_listen = this.contact_m_listen_tcp;
            m_accept = this.contact_m_accept_tcp;
        } else {
            return { success: false, error: undefined, message: "could not determine methods based on ContactProto: " + proto };
        }

        const device = this;
        const contact = this.contacts.create({
            abort_controller: new AbortController(),
            addressFamily: addressFamily,
            proto: proto,

            close() {
                return m_close.call(device, this);
            },
            bind(caddr) {
                return device.contact_bind(this, caddr);
            },
            receive(...p) {
                return device.contact_receive(this, ...p);
            },
            receiveFrom(...p) {
                return m_receiveFrom.call(device, this, ...p);
            },
            send(...p) {
                return m_send.call(device, this, ...p);
            },
            sendTo(...p) {
                return m_sendTo.call(device, this, ...p);
            },
            connect(...p) {
                return m_connect.call(device, this, ...p);
            },
            listen(...p) {
                return m_listen.call(device, this, ...p);
            },
            accept(...p) {
                return m_accept.call(device, this, ...p);
            },
            on_error(...p) {
                return device.contact_on_error(this, ...p);
            }
        });

        return { success: true, data: contact as Contact<CAF, CProto> };
    }
    contact_close(contact: Contact): DeviceResult<ContactError> {
        if (contact.abort_controller.signal.aborted) {
            throw new Error("contact is closed")
        }

        // remove contacts created by contact
        for (let i = 0; i < this.contacts.items.length; i++) {
            if (this.contacts.items[i]?.root_contact === contact) {
                this.contacts.items[i]!.close();
            }
        }

        // remove listeners for contact
        for (let i = 0; i < this.contact_receivers.length; i++) {
            if (this.contact_receivers[i]?.contact != contact) { continue; }
            delete this.contact_receivers[i];
        }

        // remove error handlers
        this.contact_error_handlers = this.contact_error_handlers.filter(([c]) => c !== contact);

        contact.abort_controller.abort();
        return { success: true, error: undefined, data: undefined };
    }
    contact_bind<Addr extends BaseAddress = BaseAddress>(contact: Contact, caddr: ContactAddress<Addr>): DeviceResult<ContactError, ContactAddress<Addr>> {
        if (contact.abort_controller.signal.aborted) {
            throw new Error("contact is closed")
        }
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

        for (let h_contact of this.contacts.items) {
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
    private contact_default_receive_options: ContactReceiveOptions = {}
    contact_receive: DeviceContactMethod<Contact["receive"]> = (contact, receiver, options?: ContactReceiveOptions) => {
        let i = -1; while (this.contact_receivers[++i] && this.contact_receivers[i]?.contact !== contact) { continue; }; // only one receiver per contact

        this.contact_receivers[i] = {
            contact: contact,
            receiver: receiver,
            options: options || this.contact_default_receive_options
        };

        return { success: true, data: undefined };
    }


    contact_on_error: DeviceContactMethod<Contact["on_error"]> = (contact, error_handler) => {
        this.contact_error_handlers.push([contact, error_handler])
    }
    private contact_dispatch_error<E extends DeviceResult<ContactError>>(contact: Contact, error: E): E {
        for (let [c, h] of this.contact_error_handlers) {
            if (c === contact) {
                h(c, error)
            }
        }
        return error;
    }

    private contact_input_raw(af: ContactAF, ...receiver_params: DropFirst<Parameters<ContactReceiver>>) {
        for (let creciver of this.contact_receivers) {
            if (!creciver || creciver.contact.addressFamily != af || creciver.contact.proto != "RAW")
                continue;
            else if (!creciver.options?.promiscuous && !receiver_params[0].destination)
                continue;

            creciver.receiver(creciver.contact, ...receiver_params);
        }
    }
    /** @returns  true = (no problem),  false = (reply with an icmp error) */
    private contact_input_udp(af: ContactAF, ...receiver_params: DropFirst<Parameters<ContactReceiver>>): boolean {
        let input_caddr = receiver_params[1];
        if (!input_caddr) return true;
        let best = __find_best_caddr_match(af, "UDP", input_caddr, this.contact_receivers);
        if (!best) {
            return false;
        };
        best.receiver(best.contact, ...receiver_params);
        return true;
    }

    private contact_method_not_supported = (contact: Contact): DeviceResult<ContactError> => {
        if (contact.abort_controller.signal.aborted) {
            throw new Error("contact is closed")
        }
        return { success: false, error: undefined, message: "method not supported for protocol" }
    }

    /** START OF TCP STUFF */
    private tcpseqnum = Math.floor(Math.random() * 2 ** 32); // set a random seed
    private tcpconnections = new Map<string, TCPConnection>();
    private tcpplaceholderreceiver() { }
    private contact_output_tcp(contact: Contact, connection: TCPConnection, tcphdr: typeof TCP_HEADER, rtentry?: DeviceRoute): DeviceResult<ContactError> {
        if (!contact.address) return { success: false, error: undefined, message: "something not working right" };

        let pseudo_header: { getBuffer(): Uint8Array };
        if (contact.addressFamily == "IPv4") {
            pseudo_header = IPV4_PSEUDO_HEADER.create({
                saddr: contact.address.saddr, daddr: contact.address.daddr
            })
        } else if (contact.addressFamily == "IPv6") {
            pseudo_header = IPV6_PSEUDO_HEADER.create({
                saddr: contact.address.saddr as IPV6Address, daddr: contact.address.daddr as IPV6Address
            })
        } else return { success: false, error: undefined, message: "something not working right" };

        // set default properties on the tcphdr
        tcphdr.set("sport", contact.address.sport)
        tcphdr.set("dport", contact.address.dport)

        tcphdr.set("seqnum", connection.sequence_number); // sequence number

        if (tcphdr.get("flags") & TCP_FLAGS.ACK)
            tcphdr.set("acknum", connection.ack_number + 1); // ack number

        tcphdr.set("window", 1024 * 40)

        return this.output_tcp({ buffer: uint8_concat([pseudo_header.getBuffer(), tcphdr.getBuffer()]) }, contact.address.daddr, rtentry);
    }
    private contact_input_tcp(af: ContactAF, ...receiver_params: DropFirst<Parameters<ContactReceiver>>) {
        let input_caddr = receiver_params[1];
        if (!input_caddr) return;
        let best = __find_best_caddr_match(af, "TCP", input_caddr, this.contact_receivers);
        let tcphdr = TCP_HEADER.from(receiver_params[0].buffer);

        if (!best) {
            if ((tcphdr.get("flags") & TCP_FLAGS.SYN) === 0) {
                return; // do not do anything
            }

            // send TCP reset
            tcphdr = TCP_HEADER.create({ flags: TCP_FLAGS.RST, dport: input_caddr.dport, sport: input_caddr.sport });
            let pseudo_header: { getBuffer(): Uint8Array };
            if (input_caddr.daddr instanceof IPV4Address) pseudo_header = IPV4_PSEUDO_HEADER.create({
                saddr: input_caddr.saddr, daddr: input_caddr.daddr
            })
            else pseudo_header = IPV6_PSEUDO_HEADER.create({
                saddr: input_caddr.saddr as IPV6Address, daddr: input_caddr.daddr as IPV6Address
            })

            return this.output_tcp({ buffer: uint8_concat([pseudo_header.getBuffer(), tcphdr.getBuffer()]) }, input_caddr.daddr);
        };

        let contact = best.contact;
        let connection = this.tcpconnections.get(tcp_connection_id(contact));
        if (!connection) return;

        switch (connection.state) {
            case TCPState.SYN_SENT: this.contact_input_tcp_syn_sent(contact, connection, tcphdr); break;
            case TCPState.SYN_RCVD: this.contact_input_tcp_syn_rcvd(contact, connection, tcphdr); break;
            case TCPState.LISTEN: this.contact_input_tcp_listen(contact, connection, tcphdr, input_caddr, best); break;
            case TCPState.FIN_WAIT_1: this.contact_input_tcp_fin_wait_1(contact, connection, tcphdr); break;
            case TCPState.FIN_WAIT_2: this.contact_input_tcp_fin_wait_2(contact, connection, tcphdr); break;
            case TCPState.CLOSING:
            case TCPState.LAST_ACK: this.contact_input_tcp_closing_last_ack(contact, connection, tcphdr); break;
            case TCPState.ESTABLISHED: this.contact_input_tcp_established(contact, connection, tcphdr, best); break;
        }
    }
    /** could make this cooler but i don't feel like it */
    private contact_input_tcp_syn_sent(contact: Contact, connection: TCPConnection, tcphdr: typeof TCP_HEADER) {
        if (tcphdr.get("flags") & TCP_FLAGS.RST) {
            this.contact_dispatch_error(contact, { success: false, error: "RESET", message: "received tcp reset flag, closing contact" })
            return this.contact_m_close_tcp(contact)
        }
        if (tcphdr.get("flags") & TCP_FLAGS.FIN) {
            return this.contact_input_tcp_established(contact, connection, tcphdr, undefined); // this is hacky but works good enough
        }

        if ((tcphdr.get("flags") & TCP_FLAGS.SYN) == 0)
            return; // !TODO: remove this could receive only a sync then this would do something different

        if ((tcphdr.get("flags") & TCP_FLAGS.ACK) == 0)
            return; // expecting ack

        // change state and reply with an  ack
        let connection_id = tcp_connection_id(contact);
        if (!connection_id || !contact.address) return; // address is going to defined because it must be otherwise this logic would not be called

        let hdr_options = tcp_read_options(tcphdr);

        let mss = contact.address.daddr instanceof IPV6Address ? 1220 : 536;
        let mss_opt = hdr_options.get(TCP_OPTION_KINDS.MSS);
        if (mss_opt && mss_opt.byteLength == 2) {
            mss = uint8_readUint16BE(mss_opt);
        }

        let window = tcphdr.get("window");
        let wsc_opt = hdr_options.get(TCP_OPTION_KINDS.WSC);
        if (wsc_opt && wsc_opt.length == 1) {
            window << (wsc_opt[0])
        }

        connection.window = window;
        connection.mss = mss;
        connection.ack_number = tcphdr.get("seqnum"); // save server sequence number
        connection.state = TCPState.ESTABLISHED;
        this.tcpconnections.set(connection_id, connection)

        tcphdr = TCP_HEADER.create({ flags: TCP_FLAGS.ACK });

        return this.contact_output_tcp(contact, connection, tcphdr);
    }
    private contact_input_tcp_syn_rcvd(contact: Contact, connection: TCPConnection, tcphdr: typeof TCP_HEADER) {
        if ((tcphdr.get("flags") & TCP_FLAGS.ACK) == 0)
            return; // expecting ack

        // change state and do nothing
        let connection_id = tcp_connection_id(contact);
        if (!connection_id || !contact.address) return; // address is going to defined because it must be otherwise this logic would not be called
        connection.state = TCPState.ESTABLISHED;
        this.tcpconnections.set(connection_id, connection)

        this.contact_m_send_tcp(contact, { buffer: new Uint8Array(0) }); // this just sends the buffered data, no new data
    }
    private contact_input_tcp_listen(contact: Contact, connection: TCPConnection, tcphdr: typeof TCP_HEADER, input_caddr: ContactAddress<BaseAddress>, receive_entry: Device["contact_receivers"][number]) {
        if ((tcphdr.get("flags") & TCP_FLAGS.SYN) == 0)
            return; // ignore, only accepting syn requests

        if (!contact.address) return;

        if (
            uint8_equals(contact.address.daddr.buffer, input_caddr.daddr.buffer) &&
            uint8_equals(contact.address.saddr.buffer, input_caddr.saddr.buffer) &&
            contact.address.dport == input_caddr.dport &&
            contact.address.sport == input_caddr.sport
        ) {
            // do nothing
            // a more specific contact can't be created
            console.warn("THIS LOGIC, is not fully fleshed out, because this should be an error, because the same foreign contact is trying to contact a second time")
        } else {
            let root_contact = contact;
            contact = this.contact_create(contact.addressFamily, "TCP").data!; // create new contact
            contact.root_contact = root_contact;
            let bind_result = this.contact_bind(contact, input_caddr);
            if (!bind_result.success)
                return;

            this.contact_receive(contact, this.tcpplaceholderreceiver);
        }

        let route = this.route_resolve(contact.address!.daddr);
        if (!route)
            return; // no outgoing interface this should not happen but misconfig could cause this

        let mss = route.destination instanceof IPV6Address ? 1220 : 536;
        let hdr_options = tcp_read_options(tcphdr)
        let mss_opt = hdr_options.get(TCP_OPTION_KINDS.MSS);
        if (mss_opt && mss_opt.byteLength == 2) {
            mss = uint8_readUint16BE(mss_opt);
        }

        let window = tcphdr.get("window");
        let wsc_opt = hdr_options.get(TCP_OPTION_KINDS.WSC);
        if (wsc_opt && wsc_opt.length == 1) {
            window << (wsc_opt[0])
        }

        // configure contact
        let connection_id = tcp_connection_id(contact);
        this.tcpconnections.set(connection_id, {
            state: TCPState.SYN_RCVD,
            in_data: [],
            out_data: [],
            sequence_number: this.tcpseqnum = add_u32((this.tcpseqnum * (this.tcpconnections.size + 1))), // !NOTE: i do not what the spec is for the initialisation for the sequence number
            ack_number: tcphdr.get("seqnum"),
            mss: mss,
            window: window,
            route: route
        });

        connection = this.tcpconnections.get(connection_id) as TCPConnection;
        if (!connection || !contact.address) return;

        // if there is an accept function set to do stuff
        if (receive_entry?.receiver && receive_entry.receiver !== this.tcpplaceholderreceiver) {
            let handler = receive_entry.receiver as Parameters<Contact["accept"]>[0];

            if (!handler(contact)) {
                this.contact_m_close_tcp(contact);
                return; // the connection was not accepted
            }
        }

        // reply with a syn+ack
        tcphdr = TCP_HEADER.create({ flags: TCP_FLAGS.SYN | TCP_FLAGS.ACK });
        mss = route.iface.mtu - (route.destination instanceof IPV6Address ? 60 : 40);
        tcp_set_option(tcphdr, TCP_OPTION_KINDS.MSS, uint8_fromNumber(mss, 2))

        this.contact_output_tcp(contact, connection, tcphdr);
        // increment sequence number
        connection.sequence_number = add_u32(connection.sequence_number + 1);
    }
    private contact_input_tcp_fin_wait_1(contact: Contact, connection: TCPConnection, tcphdr: typeof TCP_HEADER) {
        if (tcphdr.get("flags") & TCP_FLAGS.FIN) {

            if (tcphdr.get("flags") & TCP_FLAGS.ACK) {
                return this.contact_m_close_tcp(contact);
            } else {
                connection.state = TCPState.CLOSING; // simultaneous close
            }

            this.tcpconnections.set(tcp_connection_id(contact), connection);
            this.contact_output_tcp(contact, connection, TCP_HEADER.create({
                flags: TCP_FLAGS.ACK
            }))// send ack
            return
        }

        if ((tcphdr.get("flags") & TCP_FLAGS.ACK) == 0)
            return; // segment must ack
        connection.state = TCPState.FIN_WAIT_2;
        this.tcpconnections.set(tcp_connection_id(contact), connection);
        // wait for fin
    }
    private contact_input_tcp_fin_wait_2(contact: Contact, connection: TCPConnection, tcphdr: typeof TCP_HEADER) {
        if ((tcphdr.get("flags") & TCP_FLAGS.FIN) == 0)
            return;
        connection.ack_number = add_u32(connection.ack_number, 1); // increment assume that closing consumes one data unit 
        this.contact_m_close_tcp(contact);
    }
    private contact_input_tcp_closing_last_ack(contact: Contact, _: TCPConnection, tcphdr: typeof TCP_HEADER) {
        if ((tcphdr.get("flags") & TCP_FLAGS.ACK) == 0)
            return;
        this.contact_m_close_tcp(contact);
    }
    private contact_input_tcp_established(contact: Contact, connection: TCPConnection, tcphdr: typeof TCP_HEADER, receive_entry: Device["contact_receivers"][number]) {
        if (tcphdr.get("flags") & TCP_FLAGS.FIN) {
            connection.state = TCPState.LAST_ACK; // skip CLOSING state
            connection.ack_number = add_u32(connection.ack_number, 1); // increment assume that closing consumes one data unit 
            this.tcpconnections.set(tcp_connection_id(contact), connection);
            // send ack
            this.contact_output_tcp(contact, connection, TCP_HEADER.create({
                flags: TCP_FLAGS.ACK
            }));
            // send fin and close contact, could make contact close smarter
            // and have it check the connection state for what kind of segment to send
            this.contact_output_tcp(contact, connection, TCP_HEADER.create({
                flags: TCP_FLAGS.ACK | TCP_FLAGS.FIN
            }));
            return;
        }

        if (!receive_entry)
            return;

        if ((tcphdr.get("flags") & TCP_FLAGS.ACK) === 0)
            return; // ACK must be set for things to happen


        let header_length = (tcphdr.get("doffset") << 2) || 20; // if offset was unset default to 20
        // check that this packet is acknowledging sent data

        // naive approach doing checking acknowledged data
        let received_ack_num = tcphdr.get("acknum");
        for (let i = 0; i < connection.out_data.length; i++) {
            let [seqnum, buffer] = connection.out_data[i];

            if (received_ack_num <= seqnum) {
                break; // there is no point moving forward
            }

            let diff = received_ack_num - seqnum;
            if (diff >= buffer.byteLength) {
                connection.out_data.shift();
                i--;
                continue;
            }

            // data paritally accepted
            connection.out_data[0][0] += diff;
            connection.out_data[0][1] = buffer.slice(diff)
        }

        // check if there is data
        if (header_length >= tcphdr.size)
            return;


        // there is data in the segment
        let buffer = tcphdr.getBuffer().subarray(header_length);
        receive_entry.receiver(contact, { buffer: buffer }); // now user get's data do something with
        connection.ack_number = add_u32(connection.ack_number, buffer.length);

        tcphdr = TCP_HEADER.create({ flags: TCP_FLAGS.ACK });
        return this.contact_output_tcp(contact, connection, tcphdr);
    }

    private contact_m_close_tcp: DeviceContactMethod<Contact["close"]> = (contact) => {
        let connection_id = tcp_connection_id(contact);
        let connection = this.tcpconnections.get(connection_id);
        if (!connection_id || !connection || !contact.address) {
            if (!contact.abort_controller.signal.aborted) return this.contact_close(contact);
            return { success: true, data: undefined }
        }
        let flags = 0;
        let send = false;

        switch (connection.state) {
            case TCPState.SYN_RCVD:
            case TCPState.ESTABLISHED: {
                connection.state = TCPState.FIN_WAIT_1;
                flags = TCP_FLAGS.FIN | TCP_FLAGS.ACK;
                send = true;
            }; break;
            case TCPState.FIN_WAIT_1:
            case TCPState.FIN_WAIT_2: {
                flags = TCP_FLAGS.ACK;
                send = true;
                connection.state = TCPState.TIME_WAIT;
            }; break;
            case TCPState.CLOSE_WAIT: {
                connection.state = TCPState.LAST_ACK;
                flags = TCP_FLAGS.FIN | TCP_FLAGS.ACK;
                send = true;
            }; break;
            case TCPState.CLOSING: {
                connection.state = TCPState.TIME_WAIT;
            };
            case TCPState.SYN_SENT:
            case TCPState.LAST_ACK: {
                connection.state = TCPState.CLOSED;
                this.tcpconnections.delete(connection_id);
                return this.contact_close(contact);
            }
        }

        this.tcpconnections.set(connection_id, connection);
        let res: DeviceResult<ContactError> = { success: true, data: undefined };
        if (send) {
            res = this.contact_output_tcp(contact, connection, TCP_HEADER.create({ flags }))
            connection.sequence_number = add_u32(connection.sequence_number + 1)// increment sequence number
        }

        if (connection.state === TCPState.TIME_WAIT) {
            connection.state = TCPState.CLOSED;

            // in this case the contact actuallly closes
            // !TODO: the time waiting should be variable
            this.resources.create(this.schedule(() => this.tcpconnections.delete(connection_id), 20));
            return this.contact_close(contact)
        }

        return res;
    }
    private contact_m_send_tcp: DeviceContactMethod<Contact["send"]> = (contact, data) => {
        if (!contact.address)
            return { success: false, error: undefined, message: "contact must be bound" };

        let connection = this.tcpconnections.get(tcp_connection_id(contact));
        if (!connection)
            return { success: false, error: undefined, message: "connection missing" }


        if (data.buffer.byteLength > 0) {
            if (connection.state != TCPState.ESTABLISHED) {
                if (!connection.out_data[0]) {
                    connection.out_data[0] = [connection.sequence_number, new Uint8Array(0)];
                }
                connection.out_data[0][1] = uint8_concat([connection.out_data[0][1], data.buffer]); // queue data for sending when connected
                return { success: true, data: undefined };
            }

            if (connection.out_data[0] && connection.out_data[0][0] === connection.sequence_number) {
                connection.out_data[0][1] = uint8_concat([connection.out_data[0][1], data.buffer]);
            } else {
                connection.out_data.push([connection.sequence_number, data.buffer]);
            }
        }

        let buffer = uint8_concat(connection.out_data.map(([, b]) => b));

        if (buffer.byteLength === 0)
            return { success: true, data: undefined, message: "no data to send, no data sent" }

        // !TODO: be aware of the maximum segment size
        // !TODO: could add support for a timer, that would then make sending more efficient

        let tcphdr = TCP_HEADER.create({
            flags: TCP_FLAGS.ACK,
            payload: buffer,
        });

        let res = this.contact_output_tcp(contact, connection, tcphdr);

        connection.sequence_number = add_u32(connection.sequence_number, buffer.length);

        return res;
    }
    private contact_m_connect_tcp: DeviceContactMethod<Contact["connect"]> = (contact, caddr) => {
        if (!contact.address && !caddr)
            return { success: false, error: undefined, message: "contact not bound" }

        if (contact.addressFamily == "RAW")
            return { success: false, error: undefined, message: "cannot send incorrect \"address family\": " + contact.addressFamily }

        if (!contact.address) {
            if (!caddr?.dport || !caddr.daddr)
                return { success: false, error: undefined, message: "destination_port and destination_address must be defined" }

            if (!caddr.sport) {
                caddr.sport = this.contact_ephemport = Math.max(10_011, ((this.contact_ephemport + 5)) % 0xffff);
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

            let bind_result = this.contact_bind(contact, {
                saddr: caddr.saddr,
                daddr: caddr.daddr,
                dport: caddr.dport,
                sport: caddr.sport,
            });

            if (!bind_result.success)
                return bind_result as ReturnType<Contact["connect"]>;
        } else {
            if (address_is_unset(contact.address.daddr) || contact.address.dport || contact.address.sport)
                return { success: false, error: undefined, message: "source_port, destination_port and destination_address must be defined" }
        }

        // !TODO: ensure that the source address and port are set

        let connection_id = tcp_connection_id(contact);
        if (!connection_id || this.tcpconnections.get(connection_id))
            return { success: false, error: undefined, message: "contact already has a connection object defined" };

        let route = this.route_resolve(contact.address!.daddr);
        if (!route)
            return { success: false, error: "HOSTUNREACH", message: "an outgoing route could not be found" }

        // set the initial connection object
        this.tcpconnections.set(connection_id, {
            state: TCPState.SYN_SENT,
            in_data: [],
            out_data: [],
            sequence_number: this.tcpseqnum = add_u32((this.tcpseqnum * (this.tcpconnections.size + 1))), // !NOTE: i do not what the spec is for the initialisation for the sequence number
            ack_number: 0, // unknown at this point
            mss: 0, // unknown
            window: 0, // unknown

            route: route // the outgoing route, why i'm saving a reference i do not know
        });
        let connection = this.tcpconnections.get(connection_id);
        if (!connection || !contact.address) return { success: false, error: undefined, message: "something that should not happen happened" };

        this.contact_receive(contact, this.tcpplaceholderreceiver);

        // send first tcp syn packet
        let tcphdr = TCP_HEADER.create({
            sport: contact.address.sport,
            dport: contact.address.dport,
            seqnum: connection.sequence_number,
            flags: TCP_FLAGS.SYN,
            window: 0xffff,
        });

        let mss = route.iface.mtu - (route.destination instanceof IPV6Address ? 60 : 40);
        tcp_set_option(tcphdr, TCP_OPTION_KINDS.MSS, uint8_fromNumber(mss, 2))

        let res = this.contact_output_tcp(contact, connection, tcphdr)

        // consume sequence number
        connection.sequence_number = add_u32(connection.sequence_number + 1);

        return res;
    }
    private contact_m_listen_tcp: DeviceContactMethod<Contact["listen"]> = (contact) => {
        if (!contact.address)
            return { success: false, error: undefined, message: "contact must be bound, contact not bound" };

        let connection_id = tcp_connection_id(contact);
        if (!connection_id || this.tcpconnections.get(connection_id))
            return { success: false, error: undefined, message: "contact already has a connection object defined" };

        this.tcpconnections.set(connection_id, {
            state: TCPState.LISTEN,
            in_data: [],
            out_data: [],
            sequence_number: 0,
            ack_number: 0,
            mss: 0,
            window: 0
        });

        this.contact_receive(contact, this.tcpplaceholderreceiver);
        return { success: true, data: undefined, message: "contact listening" };
    }
    private contact_m_accept_tcp: DeviceContactMethod<Contact["accept"]> = (contact, handler) => {
        for (let i = 0; i < this.contact_receivers.length; i++) {
            if (this.contact_receivers[i] && this.contact_receivers[i]?.contact === contact) {
                this.contact_receivers[i]!.receiver = handler as any; // this is just a hack
                break;
            }
        }
        return { success: true, data: undefined };
    }
    private contact_m_send_raw: DeviceContactMethod<Contact["send"]> = (contact, data, destination, rtentry) => {
        if (contact.abort_controller.signal.aborted) {
            throw new Error("contact is closed")
        }

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

    private contact_m_send_udp: DeviceContactMethod<Contact["send"]> = (contact, data, _, rtentry) => {
        if (contact.abort_controller.signal.aborted) {
            throw new Error("contact is closed")
        }
        if (contact.addressFamily == "RAW") {
            return { success: false, error: undefined, message: "cannot send incorrect \"address family\": " + contact.addressFamily }
        }

        if (!contact.address) {
            return { success: false, error: undefined, message: "contact must be bound" };
        }

        const destination = contact.address.daddr

        if (!rtentry) {
            rtentry = this.route_resolve(destination);
        }

        if (!rtentry) {
            return {
                success: false,
                error: "HOSTUNREACH",
                message: "No outgoing route found"
            }
        }

        let source = rtentry.iface.addresses.find(value => value.address.constructor == destination.constructor);
        if (!source) {
            return {
                success: false,
                error: "HOSTUNREACH",
                message: "no source address for interface found"
            }
        }

        let udphdr = UDP_HEADER.create({
            sport: contact.address.sport,
            dport: contact.address.dport,
            payload: data.buffer
        });
        udphdr.set("length", udphdr.size);

        if (destination instanceof IPV4Address) {
            let pseudohdr = IPV4_PSEUDO_HEADER.create({
                saddr: source.address,
                daddr: destination,
                proto: PROTOCOLS.UDP,
                len: udphdr.size
            })

            udphdr.set("csum", calculateChecksum(uint8_concat([
                pseudohdr.getBuffer(),
                udphdr.getBuffer()])) || 0xffff);

            return this.output_ipv4({
                ...data, buffer: IPV4_HEADER.create({
                    daddr: destination,
                    saddr: source.address,
                    proto: PROTOCOLS.UDP,
                    payload: udphdr.getBuffer()
                }).getBuffer()
            }, destination, rtentry);
        }

        if (destination instanceof IPV6Address && source.address instanceof IPV6Address) {
            let pseudohdr = IPV4_PSEUDO_HEADER.create({
                saddr: source.address,
                daddr: destination,
                proto: PROTOCOLS.UDP,
                len: udphdr.size
            });

            udphdr.set("csum", calculateChecksum(uint8_concat([
                pseudohdr.getBuffer(),
                udphdr.getBuffer()])));

            return this.output_ipv6({
                ...data, buffer: IPV6_HEADER.create({
                    daddr: destination,
                    saddr: source.address,
                    nextHeader: PROTOCOLS.UDP,
                    payload: udphdr.getBuffer()
                }).getBuffer()
            }, destination, rtentry);
        }

        return { success: false, error: "HOSTUNREACH", message: "destination MUST be an ip address" };
    }

    private contact_m_sendTo_udp: DeviceContactMethod<Contact["sendTo"]> = (contact, data, caddr, rtentry) => {
        if (contact.abort_controller.signal.aborted) {
            throw new Error("contact is closed")
        }
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

        let bres = this.contact_bind(contact, caddr as ContactAddress<BaseAddress>);
        if (!bres.success) {
            return { success: false, error: bres.error, message: bres.message };
        }

        return this.contact_m_send_udp(contact, data, undefined, rtentry);
    }

    private contact_m_receiveFrom_udp: DeviceContactMethod<Contact["receiveFrom"]> = (contact, receiver, caddr, options) => {
        let bres = this.contact_bind(contact, {
            saddr: contact.addressFamily == "IPv4" ? _UNSET_ADDRESS_IPV4 : _UNSET_ADDRESS_IPV6,
            daddr: contact.addressFamily == "IPv4" ? _UNSET_ADDRESS_IPV4 : _UNSET_ADDRESS_IPV6,
            dport: 0,
            sport: 0,
            ...caddr
        });
        if (!bres.success) return bres as ReturnType<Contact["receiveFrom"]>;
        return this.contact_receive(contact, receiver, options);
    }

    schedule_default_delay = 0;
    schedule(cb: () => void, delay: number = this.schedule_default_delay): DeviceResource {
        if (delay < 0) { delay = this.schedule_default_delay; }

        const scheduled_callback = {
            id: -1,
            abort_controller: new AbortController(),
            cb: cb,

            close() {
                if (this.abort_controller.signal.aborted) return;
                this.abort_controller.abort()
                window.clearTimeout(this.id);
                return;
            },
            start() {
                if (this.id >= 0) return this;
                this.id = window.setTimeout(run_scheduled_cb, delay, this.abort_controller, this.cb);
                return this;
            }
        }

        return scheduled_callback.start();
    }
}

function run_scheduled_cb(ab: AbortController, cb: () => void) {
    if (ab.signal.aborted) return;
    cb();
    ab.abort();
}