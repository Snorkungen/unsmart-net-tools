import { type Device } from "../lib/device/device";
import { EthernetInterface, type BaseInterface } from "../lib/device/interface";

export interface NMEntity {
    width: number;
    height: number;
    x: number;
    y: number;

    moveable?: true;
    text?: string;
    bg?: string;
    entities?: NMEntity[];

    /** A method to allow for updating information if somthing else happens */
    update?(nmap: NetworkMap): void;
    onclick?(nmap: NetworkMap): void
}

class NMInterface implements NMEntity {
    width: number;
    height: number;
    x: number;
    y: number;
    text?: string | undefined;
    entities?: NMEntity[] | undefined;

    sending = false;
    receiving = false;

    nmap?: NetworkMap

    constructor(x: number, y: number, private iface: BaseInterface) {
        this.x = x;
        this.y = y;

        this.width = 10;
        this.height = 10;

        if (iface instanceof EthernetInterface) {
            iface.receive_delay
            iface.onSend = () => {
                this.sending = true;
                this.nmap?.update()
                setTimeout(() => { this.sending = false; this.nmap?.update() }, iface.receive_delay);
            }
            iface.onRecv = () => {
                this.receiving = true;
                this.nmap?.update()
                setTimeout(() => { this.receiving = false; this.nmap?.update() }, iface.receive_delay);
            }
        }
    }

    get bg() {
        if (this.sending) return "orange";
        if (this.receiving) return "purple"
        return this.iface.up ? "green" : "red";
    }

    update(nmap: NetworkMap) {
        this.nmap = nmap
        if (this.iface instanceof EthernetInterface && this.iface.up) {

            // check if there exist a connection path with this as start or end
            for (let connection_path of nmap.connection_entities) {
                if (connection_path.start_entity == this || connection_path.end_entity == this) {
                    return
                }
            }

            // dig through entries and find a iface entry
            let value: NMInterface | undefined = undefined;

            // @ts-ignore
            let target = this.iface.target;

            outer_loop: for (let entity of nmap.entities) {
                if (!(entity instanceof NMDevice)) continue;

                for (let ie of entity.entities) {
                    if (!(ie instanceof NMInterface)) continue
                    if (ie.iface == target) {
                        value = ie
                        break outer_loop
                    }
                }
            }

            if (!value) {
                return
            }

            let start: NMInterface = this;
            let end = value;

            if (value.iface.device.interfaces.length > this.iface.device.interfaces.length) {
                start = value;
                end = this
            }

            let connection_path = new NMConnectionPath(this, value)
            nmap.connection_entities.push(connection_path)
        }
    }
}

export class NMDevice implements NMEntity {
    width: number;
    height: number;
    x: number;
    y: number;
    text: string

    moveable?: true = true;
    entities: NMEntity[] = []

    device: Device;
    onclick?: () => void;

    constructor(x: number, y: number, device: Device, dimensions = { width: 60, height: 60 }) {
        this.width = dimensions.width
        this.height = dimensions.height

        this.x = x;
        this.y = y;

        this.device = device;

        this.text = device.name;
    }

    update() {

        let hwifaces = this.device.interfaces.filter((iface) => iface instanceof EthernetInterface)

        if (hwifaces.length == this.entities.length) {
            // this should do a better job att checking if the same entities are there
            return;
        }


        let x = 5, y = this.height;
        this.entities = hwifaces.map<NMEntity>((iface, i) => {
            let e = new NMInterface(x, y, iface)

            // arbitrary padding
            x += e.width + 5;

            return e
        })
    }
}

class NMConnectionPath implements NMEntity {
    width = 0;
    height = 0;
    x = 0;
    y = 0;

    constructor(public start_entity: NMEntity, public end_entity: NMEntity) {
        this.start_entity = start_entity;
        this.end_entity = end_entity;
    }
}

type NMConnectionPosition = {
    root_entity: NMEntity;
    x: number;
    y: number;
    y_pad: number;
}

export class NetworkMap {
    container?: SVGSVGElement;

    entities: Array<NMEntity> = [];
    rendered_entities: Map<NMEntity, SVGGElement> = new Map();

    connection_entities: NMConnectionPath[] = [];

    mouse_down: boolean = false;
    mouse_down_position: { x: number; y: number } = { x: -1, y: -1 };
    mouse_moved: boolean = false;
    mouse_down_entity?: NMEntity;

    set_container(container: SVGSVGElement) {
        this.container = container;
        this.update()

        this.container.addEventListener("mousedown", this.handle_mousedown.bind(this))
        this.container.addEventListener("mousemove", this.handle_mousemove.bind(this))
        this.container.addEventListener("mouseup", this.handle_mouseup.bind(this))
    }

    private get_mouse_event_entity(ev: MouseEvent): NMEntity | undefined {
        if (!this.container) return undefined;
        let rect = this.container.getBoundingClientRect();
        let x = ev.clientX - rect.left, y = ev.clientY - rect.top;
        for (let i = 0; i < this.entities.length; i++) {
            let entity = this.entities[i]
            // check if mouse is inside boundary
            // assume all entities be square

            if (
                (entity.x < x && (entity.x + entity.width) > x) &&
                (entity.y < y && (entity.y + entity.height) > y) &&
                entity.moveable
            ) {
                return entity
            }
        }

        return undefined
    }

    private handle_mousedown(ev: MouseEvent) {
        this.mouse_moved = false;

        if (!this.container) return;

        this.mouse_down_position.x = ev.clientX;
        this.mouse_down_position.y = ev.clientY;

        // loop through and check if this entity is able to be moved

        let entity = this.get_mouse_event_entity(ev)
        if (!entity) {
            return
        }

        this.mouse_down_entity = entity;
        this.mouse_down = true
    }

    private handle_mousemove(ev: MouseEvent) {
        this.mouse_moved = true;

        if (!this.mouse_down || !this.mouse_down_entity) {
            return
        }

        let diffX = ev.clientX - this.mouse_down_position.x, diffY = ev.clientY - this.mouse_down_position.y;

        this.mouse_down_entity.x += diffX;
        this.mouse_down_entity.y += diffY;

        this.mouse_down_position.x = ev.clientX;
        this.mouse_down_position.y = ev.clientY;
        this.update()
    }

    private handle_mouseup(ev: MouseEvent) {
        this.mouse_down = false;
        this.mouse_down_entity = undefined;
        this.mouse_down_position.x = -1;
        this.mouse_down_position.y = -1

        // handle click event
        if (!this.mouse_moved) {
            let entity = this.get_mouse_event_entity(ev)
            if (!entity || !entity.onclick) return;

            entity.onclick(this)
        }
    }

    update(entities = this.entities, container: SVGElement | undefined = this.container, parent_entity?: NMEntity) {
        if (!container) {
            return;
        }

        let x_offset = 0;
        let y_offset = 0;
        if (parent_entity) {
            x_offset = parent_entity.x;
            y_offset = parent_entity.y;
        }

        for (let i = 0; i < entities.length; i++) {
            let entity = entities[i];
            if (entity.update) entity.update(this)

            let g: SVGGElement,
                rect: SVGRectElement,
                text: SVGTextElement | undefined = undefined;

            let rendered_entity: SVGGElement | undefined
            if (rendered_entity = this.rendered_entities.get(entity)) {
                // do some checking if anythings changed
                g = rendered_entity
                rect = rendered_entity.children[0] as SVGRectElement

                // somehow check x and y and height & width are the same

                text = rendered_entity.children[1] as SVGTextElement | undefined
            } else {
                g = container.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "g"))
                rect = g.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "rect"))

                this.rendered_entities.set(entity, g)
            }

            let x = entity.x + x_offset, y = entity.y + y_offset;

            rect.setAttribute("x", x + "")
            rect.setAttribute("y", y + "")
            rect.setAttribute("width", entity.width + "")
            rect.setAttribute("height", entity.height + "")
            rect.setAttribute("fill", entity.bg || "#4f3f3f")

            if (entity.text && !text) {
                text = g.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "text"));
            } else if (text && !entity.text) {
                text.remove()
            }

            if (text && entity.text) {
                text.textContent = entity.text;

                // set the text position middle left

                text.setAttribute("dominant-baseline", "middle")
                text.setAttribute("text-anchor", "middle")
                text.setAttribute("x", x + (entity.width / 2) + "");
                text.setAttribute("y", y + (entity.height / 2) + "")
            }

            if (entity.entities) {
                for (let j = 0; j < entity.entities.length; j++) {
                    delete entity.entities[j].moveable; // enforce that sub entities are not moveable
                }
                this.update(entity.entities, g, entity)
            }
        }

        // lastly remove entities that are no longer in the entities list
        function check_if_entity_is_in_entities(entity: NMEntity, entities: NMEntity[]): boolean {
            for (let e of entities) {
                if (e == entity) {
                    return true;
                }

                if (e.entities && check_if_entity_is_in_entities(entity, e.entities)) {
                    return true
                }
            }

            return false
        }

        if (this.entities == entities) {
            for (let [e, g] of this.rendered_entities) {
                if (check_if_entity_is_in_entities(e, this.entities) || this.connection_entities.includes(e as any)) continue
                g.remove()
                this.rendered_entities.delete(e)
            }

            // only update paths on the root call
            this.update_connection_paths()
        }
    }

    get_absolute_position_of_entity(entity: NMEntity, entities = this.entities): NMConnectionPosition {
        for (let e of entities) {
            if (entity === e) {
                return { x: entity.x, y: entity.y, root_entity: e, y_pad: 0 }
            }

            try {
                if (!e.entities) {
                    continue
                }

                let pos = this.get_absolute_position_of_entity(entity, e.entities)
                pos.x += e.x; pos.y += e.y;
                pos.root_entity = e;
                return pos

            } catch {
                continue
            }
        }

        throw (entity)
    }

    get_connection_positions(): NMConnectionPosition[][] {
        let positions: NMConnectionPosition[][] = []

        for (let i = 0; i < this.connection_entities.length; i++) {
            let connection_path = this.connection_entities[i];
            try {
                positions.push([
                    this.get_absolute_position_of_entity(connection_path.start_entity),
                    this.get_absolute_position_of_entity(connection_path.end_entity)
                ])
            } catch (e) {
                this.connection_entities = this.connection_entities.filter(e => connection_path)
                continue
            }
        }

        return positions;
    }

    private update_connection_paths() {
        if (!this.container) return;

        const path_colors = ["#445fe8"]

        let positions = this.get_connection_positions();
        const Y_PAD = 20

        /** compares if number are aproximately the same */
        function same_same(n1: number, n2: number, scale = 10) {
            return (
                n1 == n2 ||
                (n1 - n2 > 0 && (n2 - n1) * -1 < scale) ||
                (n2 - n1 > 0 && (n1 - n2) * -1 < scale)
            )
        }

        for (let i = 0; i < positions.length; i++) {
            // have a nested loop that collects paths that start at roughly the same area
            let [start_pos, end_pos] = positions[i]

            for (let j = i + 1; j < positions.length; j++) {
                let [sub_start_pos, sub_end_pos] = positions[j]

                if ((same_same(start_pos.y, sub_start_pos.y, Y_PAD * 3) && start_pos.root_entity != sub_start_pos.root_entity) ||
                    (same_same(start_pos.y, sub_end_pos.y, Y_PAD * 3) && start_pos.root_entity != sub_end_pos.root_entity) ||
                    (same_same(end_pos.y, sub_end_pos.y, Y_PAD * 3) && end_pos.root_entity != sub_end_pos.root_entity) ||
                    (same_same(end_pos.y, sub_start_pos.y, Y_PAD * 3) && end_pos.root_entity != sub_end_pos.root_entity)
                ) {
                    // !TODO: redo this whole logic it does not really work that well
                    start_pos.y_pad += Y_PAD
                }

            }

            let connection_path = this.connection_entities[i];

            // this is what i mean when i need a connection entity
            let g: SVGGElement,
                path: SVGPathElement;

            let rendered_entity: SVGGElement | undefined
            if (rendered_entity = this.rendered_entities.get(connection_path)) {
                g = rendered_entity
                path = rendered_entity.children[0] as SVGPathElement
            } else {
                g = this.container.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "g"))
                path = g.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "path"))

                this.rendered_entities.set(connection_path, g)
            }

            let start_x = start_pos.x + (connection_path.start_entity.width / 2);
            let start_y = start_pos.y + connection_path.start_entity.height;
            let end_x = end_pos.x + (connection_path.end_entity.width / 2);
            let end_y = end_pos.y + connection_path.end_entity.height;

            let d = `M${start_x} ${start_y}`
            let y_pad = Y_PAD + start_pos.y_pad;

            if (start_y >= end_y) {
                d += "v" + y_pad
            } else {
                d += "v" + (y_pad + (end_y - start_y))
            }

            if (start_x != end_x) {
                d += "h" + (end_x - start_x)
            }

            d += `L${end_x} ${end_y}`

            path.setAttribute("d", d)
            path.style.stroke = path_colors[i % path_colors.length]
            path.style.fill = "none"
            path.style.strokeWidth = "5px"
            path.style.strokeLinejoin = "round"
        }
    }
}