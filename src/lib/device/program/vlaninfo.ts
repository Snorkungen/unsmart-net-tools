import { Device, ProcessSignal, Program } from "../device";
import { EthernetInterface, VlanInterface } from "../interface";
import { ppbind, PPFactory, ProgramParameter, ProgramParameterDefinition, ProgramParameterError } from "../internals/program-parameters";
import { formatTable, ioprintln } from "./helpers";

const VLANIF_NAME = "vlanif";
function custom_vlanif_parser(this: ProgramParameter<string>, val: string, dev: Device): string {
    if (!val.startsWith(VLANIF_NAME)) {
        throw new ProgramParameterError(this);
    }
    
    if (PPFactory.parse_number.call(this, val.substring(VLANIF_NAME.length), dev) <= 0) {
        throw new ProgramParameterError(this);
    }

    return val;
}

function custom_etheriface_parser(this: ProgramParameter<EthernetInterface>, val: string, dev: Device): EthernetInterface {
    let iface = PPFactory.parse_baseiface.call(this, val, dev);

    if (iface instanceof EthernetInterface) {
        return iface;
    }

    throw new ProgramParameterError(this);
}

const PPEtheriface = PPFactory.create("IFID", custom_etheriface_parser)
const PPVlanrule = PPFactory.keywords("VLAN_RULE", ["trunk", "access"]);
const PPVid = PPFactory.multiple(PPFactory.number("VID"))

const pdef = new ProgramParameterDefinition([
    ppbind(["vlaninfo"], "list all existing vlans"),
    ppbind(["vlaninfo", PPFactory.create("VLANIF_ID", custom_vlanif_parser), PPFactory.optional(PPFactory.keyword("remove"))], "create a vlan interface, or remove one"),
    ppbind(["vlaninfo", PPEtheriface, PPVlanrule, PPFactory.optional(PPVid)], "set an interfaces vlan rule, access or trunk"),
    ppbind(["vlaninfo", PPEtheriface, PPVid], "set vlan ids, -4 means remove vid 4")
]);

export const DEVICE_PROGRAM_VLANINFO: Program = {
    name: "vlaninfo",
    description: "interacts with vlan",
    parameters: pdef,
    init(proc, args) {
        const res = pdef.parse(proc.device, args);

        if (!res.success) {
            ioprintln(proc.io, pdef.message(res));
            return ProcessSignal.ERROR;
        }

        const [, ifid, rest, numbers] = res.arguments;
        if (!ifid) {
            // currently no special rules can be configured per vlan, so just list the existing vlan related interfaces

            let table: string[][] = [["Interface", ""]];
            for (let iface of proc.device.interfaces) {
                if (iface instanceof VlanInterface) {
                    table.push([iface.id(), "" + iface.vid])
                } else if (iface instanceof EthernetInterface && iface.vlan) {
                    table.push([iface.id(), `${iface.vlan.type} ${iface.vlan.vids.join(",")}`])
                }
            }

            proc.io.write(formatTable(table));
            return ProcessSignal.EXIT;
        } else if (ifid instanceof EthernetInterface) {
            const iface = ifid;

            if (rest == "access") {
                if (!iface.vlan) {
                    iface.vlan = { type: "access", vids: [] }
                }
                iface.vlan.type = "access";
            } else if (rest == "trunk") {
                if (!iface.vlan) {
                    iface.vlan = { type: "trunk", vids: [] }
                }
                iface.vlan.type = "trunk";
            }

            if (!iface.vlan) {
                ioprintln(proc.io, "interface must be configured as either \"access\" or \"trunk\"");
                return ProcessSignal.ERROR;
            }

            let vids = Array.isArray(rest) ? rest : numbers;
            if (vids) {
                for (let vid of vids) {
                    if (vid < 0) { // remove vid
                        iface.vlan.vids = iface.vlan.vids.filter(v => v !== Math.abs(vid));
                    } else { // add vid
                        if (!iface.vlan.vids.includes(vid)) {
                            iface.vlan.vids.push(vid);
                        }
                    }
                }
            } 
            
            if (typeof rest == "string" && (!vids || iface.vlan.vids.length == 0)) {
                ioprintln(proc.io, "interface must be configured with at least one vlan id");
                return ProcessSignal.ERROR;
            }

            if (iface.vlan.vids.length == 0 && vids?.length) {
                delete iface.vlan
                ioprintln(proc.io, `${iface.id()}\tvlan removed`);
            } else {
                ioprintln(proc.io, `${iface.id()}\t${iface.vlan.type} ${iface.vlan.vids.join(",")}`);
            }

        } else if (ifid.startsWith(VLANIF_NAME)) {
            // this is something that is botherd with vlanifs ...

            let vid = parseInt(ifid.substring(VLANIF_NAME.length));
            if (isNaN(vid)) { return ProcessSignal.ERROR; /* this should throw parser already checked this */ }

            let vlanif = proc.device.interfaces.find(iface => (iface instanceof VlanInterface) && iface.vid == vid);

            if (rest == "remove") { // remove interface
                if (vlanif) {
                    proc.device.interface_remove(vlanif)
                }

                ioprintln(proc.io, "vlan interface removed for vlan: " + vid);
            } else if (!vlanif) { // add vlan interface
                proc.device.interface_add(new VlanInterface(proc.device, vid));
                ioprintln(proc.io, "vlan interface created for vlan: " + vid);
            } else {
                ioprintln(proc.io, "vlan interface already exists for vlan: " + vid);
            }
        }

        return ProcessSignal.EXIT;
    },
    __NODATA__: true
}