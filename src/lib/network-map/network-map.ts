// network-map 2

import { Device, Process, ProcessSignal, Program } from "../device/device";
import { BaseInterface, EthernetInterface } from "../device/interface";
import { network_switch_get_ports, NETWORK_SWITCH_PORTS_STORE_KEY, NetworkSwitch, NetworkSwitchPortState } from "../device/network-switch";
import { DAEMON_STP_SERVER_STATE_STORE_KEY, storev_stp_state } from "../device/program/stp-server";

// special features zoom, pan, edit connection paths
const INTERFACE_ANIM_DELAY = 420;
const IF_SEND_COLOR = "#ff8533"
const IF_RECV_COLOR = "#b300b3"
const IF_BLOCKING_COLOR = "#68688f"
const CONNECTION_FILL_COLOR = "#b30077"
const CONNECTION_FILL_COLOR_2 = "#800055"

type NMPosition = {
    x: number;
    y: number;
}

type NMShapeObject = {
    position: NMPosition;
    /** object associated with the object etc */
    assob?: object;
} & (
        {
            type: "shape",
            /** whether the shape can be moved */
            static?: boolean;
            /** all objects positions are relative to the container , objects cannot be nested, order determines if things get over-drawn */
            objects: NMShapeObject[];
        } |
        { type: "rect", width: number; height: number; fillColor: string, strokeColor?: string } |
        { type: "text", value: string; color: string }
    );

/** Generic container for devices, where handlers are attached */
type NMShape = NMShapeObject & { type: "shape" }
type NMRect = NMShapeObject & { type: "rect" };

type NMConnection = {
    begin: [NMShape, NMShapeObject, number]; // and theese would be object references
    end: [NMShape, NMShapeObject, number];

    fillColor: string;
    fillColor_ref_count: number;
}

type NMMouseState = {
    down?: true;
    moved?: true;
    position?: NMPosition;
    selected?: ReturnType<typeof network_map_get_shape_object_from_mouseevent>;
}

type NMState = {
    origin: NMPosition; // for panning, this is not really solving or doing anything novel
    scale: number; // for zoom,  again this is not doing anything new that I could not do with the previous solution

    // the thing I actually want to solve is the connection paths, that in this model would be from one Shapes->object to another Shapes->object
    // and track them, and stuff

    connections: NMConnection[];
    shapes: NMShape[];


    container: SVGSVGElement;
    element_cache: [object, SVGElement][];

    mstate: NMMouseState;

    onclick?: (...objects: object[]) => void
}

const DAEMON_NETWORK_MAP_DEVICE_MONITOR: Program<{
    if_delay: number;
    dimensions: { width: number; height: number; ifpad: number; ifsize: number }
    state: NMState;
    shape: NMShape;
}> = {
    name: "daemon_network_map_device_monitor",
    init: function (proc: Process<any>, _, data) {
        if (!data) { return ProcessSignal.ERROR };
        const { state, shape, dimensions, if_delay } = data;
        if (!state || !shape || !dimensions || !if_delay) return ProcessSignal.ERROR;

        proc.data = data;

        proc.resources.create(proc.device.event_create([
            "interface_connect",
            "interface_disconnect"
        ], network_map_device_ethiface_on_connect_or_disconnect(state, shape)))
        proc.resources.create(
            proc.device.event_create("interface_recv", network_map_device_ethiface_on_send_or_recv(state, shape, "recv"))
        )
        proc.resources.create(
            proc.device.event_create("interface_send", network_map_device_ethiface_on_send_or_recv(state, shape, "send"))
        );
        proc.resources.create(
            proc.device.event_create([
                "interface_add",
                "interface_remove"
            ], () => network_map_device_refresh_interfaces(state, shape, proc.device, if_delay, dimensions.height, dimensions.ifsize, dimensions.ifpad))
        );

        if (proc.device instanceof NetworkSwitch) {
            proc.resources.create(
                proc.device.event_create("store_set",
                    () => network_map_device_refresh_interfaces(state, shape, proc.device, if_delay, dimensions.height, dimensions.ifsize, dimensions.ifpad),
                    NETWORK_SWITCH_PORTS_STORE_KEY
                )
            )

            proc.resources.create(
                proc.device.event_create("store_set", () => {
                    let rect = shape.objects[0];
                    if (rect.type != "rect") return;
                    let stp_state = proc.device.store_get(DAEMON_STP_SERVER_STATE_STORE_KEY);
                    if (!storev_stp_state.validate(stp_state)) return;

                    if (stp_state?.bridge_id == stp_state?.designated_root) {
                        rect.strokeColor = "#aaaaaa";
                    } else {
                        delete rect.strokeColor;

                        // indicate root port
                        let port = network_switch_get_ports(proc.device)[stp_state.root_port_no];
                        if (port) {
                            for (let so of shape.objects) {
                                if (so.assob instanceof BaseInterface && so.type == "rect") {
                                    if (so.assob == port.iface) {
                                        so.strokeColor = "#eaeaea"
                                    } else {
                                        delete so.strokeColor
                                    }
                                }
                            }
                        }
                    }

                    network_map_render(state)
                }, DAEMON_STP_SERVER_STATE_STORE_KEY)
            )
        }

        return ProcessSignal.__EXPLICIT__;
    }
}

function network_map_device_setup_connection(state: NMState, shape: NMShape, so: NMShapeObject, iface: BaseInterface) {
    if (!(iface instanceof EthernetInterface)) {
        return
    }

    let r = state.shapes.find(s => s.assob === iface.target?.device)
    if (!r) return;
    let tobj = r.objects.find(s => s.assob === iface.target)
    if (!tobj) return;

    // select the start

    let begin: [NMShape, NMShapeObject, number], end: [NMShape, NMShapeObject, number];

    let target_ifaces = iface.target!.device.interfaces.filter(v => !v.virtual);
    let source_ifaces = iface.device.interfaces.filter(v => !v.virtual)

    let t_idx = target_ifaces.indexOf(iface.target!)
    let s_idx = source_ifaces.indexOf(iface)

    if (target_ifaces.length > source_ifaces.length) {
        begin = [r, tobj, t_idx];
        end = [shape, so, s_idx];
    } else {
        begin = [shape, so, s_idx];
        end = [r, tobj, t_idx];
    }

    state.connections.push({
        begin: begin,
        end: end,
        fillColor: CONNECTION_FILL_COLOR,
        fillColor_ref_count: 0,
    });
}

function network_map_device_iface_update_appearance(so: NMRect, type?: "recv" | "send") {
    if (!(so.assob instanceof BaseInterface)) {
        return;
    }

    if (!type) {
        if (so.assob.device instanceof NetworkSwitch) {
            const ports = network_switch_get_ports(so.assob.device);
            if (ports) {
                const port = Object.values(ports).find(p => p && p.iface == so.assob);
                if (port && port.iface.up && port.state <= NetworkSwitchPortState.LISTENING) {
                    so.fillColor = IF_BLOCKING_COLOR;
                    return;
                }
            }
        }
        so.fillColor = so.assob.up ? "green" : "red";
    } else if (type == "recv") {
        so.fillColor = IF_RECV_COLOR;
    } else if (type == "send") {
        so.fillColor = IF_SEND_COLOR;
    }
}

function network_map_device_ethiface_on_connect_or_disconnect(state: NMState, shape: NMShape) {
    return function (iface: BaseInterface) {
        let so = shape.objects.find(o => o.assob == iface);
        if (!so || so.type != "rect") return;

        network_map_device_iface_update_appearance(so);

        if (!iface.up) {
            // delete connection
            let connection = state.connections.find(conn => (conn.begin[1] == so || conn.end[1] == so));
            if (connection) {
                network_map_remove_element(state, connection);
                state.connections = state.connections.filter(con => con != connection)
            }
        } else {
            network_map_device_setup_connection(state, shape, so, iface);
        }
        network_map_render(state);
    }
}

function network_map_device_ethiface_on_send_or_recv(state: NMState, shape: NMShape, type: "recv" | "send") {
    return function (iface: BaseInterface) {
        let so = shape.objects.find(o => o.assob == iface);
        if (!so || so.type != "rect" || !(iface instanceof EthernetInterface)) {
            return
        };

        network_map_device_iface_update_appearance(so, type);

        // get a connnection and do stuff
        let connection = network_map_connection_get(state, so);
        if (connection && connection.begin[1] == so) {
            connection.fillColor = CONNECTION_FILL_COLOR_2;
            connection.fillColor_ref_count++;
        }

        window.setTimeout(() => {
            network_map_device_iface_update_appearance(so);
            if (connection && connection.begin[1] == so) {
                connection.fillColor_ref_count--;

                if (connection.fillColor_ref_count <= 0) {
                    connection.fillColor = CONNECTION_FILL_COLOR;
                }
            }

            network_map_render(state);
        }, (iface.receive_delay || 0))
        network_map_render(state);
    }
}

function network_map_device_refresh_interfaces(state: NMState, shape: NMShape, dev: Device, if_delay: number, height: number, ifsize: number, ifpad: number) {
    // first teardown all the objects
    // remove all interfaces rect
    shape.objects = shape.objects.filter((so) => {
        if (so.type != "rect") return true;
        if (!so.assob || (so.assob && so.assob instanceof BaseInterface && so.assob.virtual)) return true;

        // clean up object and disconnet paths
        let connection = state.connections.find(conn => (conn.begin[1] == so || conn.end[1] == so));
        if (connection) {
            network_map_remove_element(state, connection);
            state.connections = state.connections.filter(con => con != connection)
        }
        network_map_remove_element(state, so);

        return false;
    });

    // create non-virtual interfaces
    let i = 0;
    for (let iface of dev.interfaces) {
        if (iface.virtual) continue;

        shape.objects.push({
            type: "rect",
            position: { x: (i) * (ifsize) + (i + 1) * ifpad, y: height },
            fillColor: "",
            height: ifsize,
            width: ifsize,
            assob: iface,
        });

        i++;

        let so = shape.objects.at(-1)! as NMRect;
        network_map_device_iface_update_appearance(so);

        // setup connection
        network_map_device_setup_connection(state, shape, so, iface);
        // find the associated shape and then the corresponding interface

        if (iface instanceof EthernetInterface) {
            iface.receive_delay = if_delay;
        }
    }

    network_map_render(state);
}

export function network_map_init_device_shape(state: NMState, dev: Device, x: number, y: number, dimensions = { width: 60, height: 60 }, if_delay = INTERFACE_ANIM_DELAY): NMShape {
    let shape: NMShape = {
        type: "shape",
        objects: [],
        position: { x, y },
        assob: dev,
    };

    let height = dimensions.height, width = dimensions.width;
    const ifpad = 5, ifsize = 10;

    // add rect as background
    shape.objects.push({
        type: "rect",
        position: { x: 0, y: 0 },
        fillColor: "#faeae5",
        height: height,
        width: width,
    });

    // add text label
    shape.objects.push({
        type: "text",
        position: { x: width * 0.5, y: height * 0.5 },
        color: "#2e5e4e",
        value: dev.name,
    });

    state.shapes.push(shape);

    // add non virtual interfaces
    network_map_device_refresh_interfaces(state, shape, dev, if_delay, height, ifsize, ifpad);

    dev.process_start(DAEMON_NETWORK_MAP_DEVICE_MONITOR, undefined, {
        dimensions: { ...dimensions, ifpad, ifsize },
        state,
        shape,
        if_delay
    })
    return shape;
}

export function network_map_remove_device_shape(state: NMState, dev: Device) {
    let shape = state.shapes.find((so) => so.assob == dev);
    if (!shape) return;

    // close the monitor program
    let proc = dev.processes.items.find(p => p?.id.startsWith(DAEMON_NETWORK_MAP_DEVICE_MONITOR.name));
    if (proc) {
        proc.close(ProcessSignal.EXIT);
    }

    // remove all interfaces 
    for (let iface of dev.interfaces) {
        dev.interface_remove(iface);
    }

    // remove from element cache
    network_map_remove_element(state, shape);
    state.shapes = state.shapes.filter(so => so != shape);
}

function network_map_init_element(so: NMShapeObject, element?: SVGElement): SVGElement {

    if (so.type == "text") {
        if (!element) {
            element = document.createElementNS("http://www.w3.org/2000/svg", "text");
        }

        element.textContent = so.value;
        element.setAttribute("dominant-baseline", "middle")
        element.setAttribute("text-anchor", "middle")
        element.style.userSelect = "none"

        element.setAttribute("fill", so.color)
        element.setAttribute("stroke", so.color)
        element.style.pointerEvents = "none"
    } else if (so.type == "rect") {
        if (!element) {
            element = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        }

        element.setAttribute("width", so.width.toString());
        element.setAttribute("height", so.height.toString());
        element.setAttribute("rx", (so.height * 0.0333).toString());

        element.setAttribute("fill", so.fillColor)

        if (so.strokeColor) {
            element.setAttribute("stroke-width", (((so.height * so.width) ** (1 / 2)) * 0.1) + "px");
            element.setAttribute("stroke", so.strokeColor)
        } else {
            element.removeAttribute("stroke-width");
            element.removeAttribute("stroke");
        }

    } else if (so.type == "shape") {
        if (!element) {
            element = document.createElementNS("http://www.w3.org/2000/svg", "g");
        }

        element.style.cursor = "pointer"
    } else {
        throw new Error("unknown NMShapeObject")
    }

    return element;
}

function network_map_remove_element(state: NMState, v: object) {
    let e = state.element_cache.find(([o]) => o == v);
    if (!e) return;
    e[1].remove();
    state.element_cache = state.element_cache.filter(ce => ce != e);
}

function network_map_get_element(state: NMState, v: NMShapeObject, parent?: SVGElement): SVGElement {
    for (let [o, e] of state.element_cache) {
        if (o === v) {

            return network_map_init_element(v, e);
        }
    }

    // create the element
    if (v.type == "shape") {
        parent = state.container;
    }

    if (!parent) {
        throw new Error("parent must be given when creating element that isn't a shape")
    }

    let element = network_map_init_element(v);

    parent.appendChild(element);
    state.element_cache.push([v, element]);

    return element;
}

function network_map_connection_get(state: NMState, so: NMShapeObject): undefined | NMConnection {
    for (let connection of state.connections) {
        if (connection.begin[0] == so || connection.begin[1] == so) {
            return connection
        }

        if (connection.end[0] == so || connection.end[1] == so) {
            return connection
        }
    }

    return undefined;
}

function network_map_connection_construct_path(state: NMState, connection: NMConnection): string {
    if (connection.begin[1].type != "rect" || connection.end[1].type != "rect") throw new Error("invalid input")

    // what i wanted to do is some kind of collision detection and stuff

    let bX = connection.begin[0].position.x + connection.begin[1].position.x + connection.begin[1].width / 2,
        bY = connection.begin[0].position.y + connection.begin[1].position.y + connection.begin[1].height;
    let eX = connection.end[0].position.x + connection.end[1].position.x + connection.end[1].width / 2,
        eY = connection.end[0].position.y + connection.end[1].position.y + connection.end[1].height;

    bX -= state.origin.x;
    bY += state.origin.y;
    eX -= state.origin.x;
    eY += state.origin.y;

    let d = `M${bX} ${bY}`;
    let yPad = (15) * (connection.begin[2] + 1);

    if (bY >= eY) {
        d += "v" + yPad;
    } else {
        d += "v" + (yPad + (eY - bY));
    }

    if (bX != eX) {
        d += "h" + (eX - bX);
    }

    d += `L${eX} ${eY}`

    return d;
}

export function network_map_render(state: NMState) {
    // the previous version was doing recursion which i do not like

    // render connections
    for (let connection of state.connections) {
        if (connection.begin[1].type != "rect") continue
        if (connection.end[1].type != "rect") continue

        let path: SVGPathElement | undefined = undefined
        for (let [o, e] of state.element_cache) {
            if (o === connection) {
                path = e as SVGPathElement;
            }
        }

        if (!path) {
            path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            state.container.appendChild(path);
            state.element_cache.push([connection, path]);
        }

        path.setAttribute("d", network_map_connection_construct_path(state, connection));

        path.style.stroke = connection.fillColor;
        path.style.fill = "none"
        path.style.strokeWidth = "5px"
        path.style.strokeLinejoin = "round"
    }

    for (let shape of state.shapes) {
        // find an element in the entity cache
        let g = network_map_get_element(state, shape);

        // TODO: detect shape overlap

        // do something ...
        for (let o of shape.objects) {
            let e = network_map_get_element(state, o, g);

            e.setAttribute("x", (-state.origin.x + shape.position.x + o.position.x) + "");
            e.setAttribute("y", (state.origin.y + shape.position.y + o.position.y) + "");
        }
    }
}

function network_map_get_shape_object_from_mouseevent(state: NMState, event: MouseEvent): NMShapeObject[] {
    // I could just leverage the cache to get the object or something etc ...
    // I think that would be best because i want  to be able to select specific interfaces and stuff

    let cached_value: undefined | [object, SVGElement] = undefined;

    for (let cv of state.element_cache) {
        if (event.target === cv[1]) {
            cached_value = cv;
        }
    }

    if (!cached_value) {
        return [];
    }

    // loop thru all shapes and stuff to get stuff etc ...
    for (let shape of state.shapes) {
        if (cached_value[0] == shape) {
            // this highly unlikely
            return [shape];
        }

        for (let so of shape.objects) {
            if (so == cached_value[0]) {
                return [shape, so]
            }
        }
    }

    return [];
}

export function network_map_init_state(container: SVGSVGElement): NMState {
    let state: NMState = {
        scale: 1,
        origin: { x: 0, y: 0 },

        shapes: [],
        connections: [],

        container: container,
        element_cache: [],

        mstate: {}
    }

    container.style.border = "blue 2px solid"

    container.addEventListener("mousedown", (event) => {
        state.mstate.down = true;
        state.mstate.position = { x: event.clientX, y: event.clientY };

        state.mstate.selected = network_map_get_shape_object_from_mouseevent(state, event);
    });

    container.addEventListener("mousemove", (event) => {
        if (!state.mstate.down || !state.mstate.position) return;
        state.mstate.moved = true;

        let diffX = event.clientX - state.mstate.position.x, diffY = event.clientY - state.mstate.position.y;

        let shape: NMShapeObject | undefined = undefined;
        if (state.mstate.selected && state.mstate.selected.length >= 1) {
            shape = state.mstate.selected[0];
        }

        if (shape) {
            shape.position.x += diffX;
            shape.position.y += diffY;
        } else { // assume this a panning motion
            state.origin.x -= diffX;
            state.origin.y += diffY;
        }

        state.mstate.position.x = event.clientX;
        state.mstate.position.y = event.clientY;

        network_map_render(state);
    });

    const handle_mouseup = () => {
        if (!state.mstate.moved && (state.mstate.selected && state.mstate.selected.length >= 1)) {
            let objs = state.mstate.selected.map(so => so.assob).filter(Boolean) as object[];

            if (!state.onclick || objs.length < 1) {
                return;
            }

            state.onclick(...objs);
        }

        state.mstate = {};
    }

    container.addEventListener("mouseup", (handle_mouseup));
    container.addEventListener("mouseleave", (handle_mouseup));

    return state;
}