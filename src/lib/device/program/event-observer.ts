import { PacketCaptureEthernetReader, PacketCaptureRecordData } from "../../packet-capture";
import { NetworkData, Process, ProcessSignal, Program } from "../device";
import { BaseInterface } from "../interface";
import { device_program_register } from "../internals/program";
import { ioprintln } from "./helpers";

export const DAEMON_EVENT_OBSERVER_FRAMES_STORE_KEY = "daemon_event_observer:frames";
export type Event_Observer_Frames = { time: number, buffer: Uint8Array, iface: BaseInterface }[];

/** <data>.buffer must be an ETHERNET_FRAME */
function log_frame(proc: Process, type: "send" | "loopback" | "recv", iface: BaseInterface, data: NetworkData) {
    const device = proc.device;

    let reader = new PacketCaptureEthernetReader(data.buffer, 0, { structs: [] } as any)
    let frame_info: PacketCaptureRecordData = reader.read()

    switch (type) {
        case "recv":
            console.info(`${device.name} - ${iface.id()}: received a frame from ${frame_info.saddr} - ${frame_info.protocol}`)
            break;
        case "send":
            console.info(`${device.name} - ${iface.id()}: sent a frame to ${frame_info.daddr} - ${frame_info.protocol} ${!frame_info.info.length ? "" : frame_info.info.join(" ")}`)
            break;
        case "loopback":
            console.info(`${device.name} - ${iface.id()}: loopback from(${frame_info.saddr}) to(${frame_info.daddr}) - ${frame_info.protocol} ${!frame_info.info.length ? "" : frame_info.info.join(" ")}`)
            break;
    }

    let frames = device.store_get<Event_Observer_Frames>(DAEMON_EVENT_OBSERVER_FRAMES_STORE_KEY);
    if (!frames) {
        frames = [];
    }

    frames.push({
        time: Date.now(),
        buffer: new Uint8Array(data.buffer),
        iface: iface,
    });

    device.store_set(DAEMON_EVENT_OBSERVER_FRAMES_STORE_KEY, frames);
}

function handle_interface_send(this: Process, iface: BaseInterface, data: NetworkData) { return log_frame(this, "send", iface, data) }
function handle_interface_recv(this: Process, iface: BaseInterface, data: NetworkData) { return log_frame(this, "recv", iface, data) }
function handle_interface_loopback(this: Process, iface: BaseInterface, data: NetworkData) { return log_frame(this, "loopback", iface, data) }

function handle_process_message(proc: Process, type: string, message: string) {
    const device = proc.device;
    console.info(`${device.name} - ${proc.id} - [${type}]: ${message}`);
}

// !TODO: Allow configuration of what gets logged

export const DAEMON_EVENT_OBSERVER: Program = device_program_register({
    name: "daemon_event_observer",
    description: "observes dispatched events",
    init(proc) {
        const device = proc.device;

        proc.resources.create(device.event_create("interface_send", handle_interface_send.bind(proc)));
        proc.resources.create(device.event_create("interface_recv", handle_interface_recv.bind(proc)));
        proc.resources.create(device.event_create("interface_loopback", handle_interface_loopback.bind(proc)));

        proc.resources.create(device.event_create("process_message", handle_process_message))

        return ProcessSignal.__EXPLICIT__;
    },
    __NODATA__: true
})

export function process_print_messages(proc: Process) {
    proc.resources.create(proc.device.event_create("process_message", (_, type, msg) => {
        ioprintln(proc.io, `[${type}]: ${msg}`)
    }, proc))
}