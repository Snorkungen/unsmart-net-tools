// network-map 2

import type { Device } from "../device/device";
import { BaseInterface, EthernetInterface } from "../device/interface";

// special features zoom, pan, edit connection paths
const INTERFACE_ANIM_DELAY = 720;
const IF_SEND_COLOR = "#ff8533"
const IF_RECV_COLOR = "#b300b3"
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
        { type: "rect", width: number; height: number; fillColor: string } |
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
    shape?: NMShape;
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
        so.fillColor = so.assob.up ? "green" : "red";
    } else if (type == "recv") {
        so.fillColor = IF_RECV_COLOR;
    } else if (type == "send") {
        so.fillColor = IF_SEND_COLOR;
    }
}

function network_map_device_ethiface_on_connect_or_disconnect(state: NMState, shape: NMShape, so: NMRect) {
    return function (iface: EthernetInterface) {
        network_map_device_iface_update_appearance(so);
        network_map_render(state);
    }
}

function network_map_device_ethiface_on_send_or_recv(state: NMState, shape: NMShape, so: NMRect, type: "recv" | "send") {
    return function () {
        if (!(so.assob instanceof EthernetInterface)) throw new Error("assertion")

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
        }, (so.assob!.receive_delay || 0) * 1.05)
        network_map_render(state);
    }
}

export function network_map_device_shape(state: NMState, dev: Device, x: number, y: number, dimensions = { width: 60, height: 60 }, if_delay = INTERFACE_ANIM_DELAY): NMShape {
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
            iface.onConnect = network_map_device_ethiface_on_connect_or_disconnect(state, shape, so);
            iface.onDisconnect = network_map_device_ethiface_on_connect_or_disconnect(state, shape, so);
            iface.onRecv = network_map_device_ethiface_on_send_or_recv(state, shape, so, "recv");
            iface.onSend = network_map_device_ethiface_on_send_or_recv(state, shape, so, "send");

            iface.receive_delay = if_delay;
        }
    }

    return shape;
}

function network_map_init_element(so: NMShapeObject, element?: SVGElement): SVGElement {

    if (so.type == "text") {
        if (!element) {
            element = document.createElementNS("http://www.w3.org/2000/svg", "text");
        }

        element.textContent = so.value;
        element.setAttribute("dominant-baseline", "middle")
        element.setAttribute("text-anchor", "middle")

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

function network_map_shape_get_bounding_box(shape: NMShape): NMPosition & { width: number; height: number } {
    // do stuff i guess

    let x = shape.position.x, y = shape.position.y;
    let width = 0, height = 0;

    // get the widths and heights of the objects

    for (let so of shape.objects) {
        if (so.type == "rect") {
            // how would this handle negative positions
            if (so.position.x < 0) {
                throw new Error("accounting for negative positions is not handled")
            }

            if (so.position.y < 0) {
                throw new Error("accounting for negative positions is not handled")
            }

            if ((so.position.x + so.width) > width) {
                width = so.position.x + so.width;
            }

            if ((so.position.y + so.height) > height) {
                height = so.position.y + so.height;
            }
        }
    }

    return {
        x: x,
        y: y,
        width: width,
        height: height,
    }
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
        let res = network_map_get_shape_object_from_mouseevent(state, event);
        if (!res.length) {
            // missed
            return;
        }
        let [shape] = res;
        if (shape.type != "shape") return;

        state.mstate.down = true;
        state.mstate.shape = shape;
        state.mstate.position = { x: event.clientX, y: event.clientY };
    });

    container.addEventListener("mousemove", (event) => {
        if (!state.mstate.down || !state.mstate.shape || !state.mstate.position) return;
        state.mstate.moved = true;

        let diffX = event.clientX - state.mstate.position.x, diffY = event.clientY - state.mstate.position.y;

        state.mstate.shape.position.x += diffX;
        state.mstate.shape.position.y += diffY;

        state.mstate.position.x = event.clientX;
        state.mstate.position.y = event.clientY;

        network_map_render(state);
    });

    const handle_mouseup = () => {
        if (!state.mstate.moved && state.mstate.shape) {
            // handle click and stuff
            if (!state.onclick || !state.mstate.shape.assob) return;

            state.onclick(state.mstate.shape.assob)
        }

        state.mstate = {};
    }

    container.addEventListener("mouseup", (handle_mouseup));
    container.addEventListener("mouseleave", (handle_mouseup));

    return state;
}