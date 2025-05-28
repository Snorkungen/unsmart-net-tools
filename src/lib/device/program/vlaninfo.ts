import { uint8_fromString } from "../../binary/uint8-array";
import { ProcessSignal, Program } from "../device";
import { EthernetInterface, VlanInterface } from "../interface";
import { formatTable } from "./helpers";

export const DEVICE_PROGRAM_VLANINFO: Program = {
    name: "vlaninfo",
    description: "interacts with vlan",
    content: `vlaninfo -- list the existing vlans
vlaninfo vlanif[VID] -- create a vlan interface for vid
vlaninfo vlanif[VID] remove -- delete a vlanif
vlaninfo eth0 access -- set the interface to be access
vlaninfo eth0 1 2 3 -4 5 6 assign the following vlans to the interface, and remove vlan 4`,
    init(proc, argv) {
        argv.shift();

        if (argv.length == 0) {
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
        }

        const first_arg = argv.shift();

        if (first_arg?.startsWith("vlanif")) {
            // this is something that is botherd with vlanifs ...
            let vid = parseInt(first_arg.substring("vlanif".length));
            if (isNaN(vid)) {
                proc.io.write(uint8_fromString("failed to read: " + first_arg));
                return ProcessSignal.ERROR;
            }

            let vlanif = proc.device.interfaces.find(iface => (iface instanceof VlanInterface) && iface.vid == vid);

            if (argv.includes("remove")) { // remove interface
                if (vlanif) {
                    proc.device.interface_remove(vlanif)
                }

                proc.io.write(uint8_fromString("vlan interface removed for vlan: " + vid));
            } else if (!vlanif) { // add vlan interface
                proc.device.interface_add(new VlanInterface(proc.device, vid));
                proc.io.write(uint8_fromString("vlan interface created for vlan: " + vid));
            } else {
                proc.io.write(uint8_fromString("vlan interface already exists for vlan: " + vid));
            }

            return ProcessSignal.EXIT;
        }

        let iface = proc.device.interfaces.find(iface => iface.id() == first_arg && (iface instanceof EthernetInterface));

        if (!iface) {
            proc.io.write(uint8_fromString("no vlan aware interface exist with the id of: " + first_arg));
            return ProcessSignal.ERROR;
        }

        if (!(iface instanceof EthernetInterface)) {
            throw new Error("iface must be an eth interface")
        }

        if (argv.includes("access")) {
            if (!iface.vlan) {
                iface.vlan = { type: "access", vids: [] }
            }
            iface.vlan.type = "access";
        }
        if (argv.includes("trunk")) {
            if (!iface.vlan) {
                iface.vlan = { type: "trunk", vids: [] }
            }
            iface.vlan.type = "trunk";
        }

        if (!iface.vlan) {
            proc.io.write(uint8_fromString("interface must be configured as either \"access\" or \"trunk\""));
            return ProcessSignal.ERROR;
        }

        
        for (let v of argv) {
            let vid = parseInt(v);
            if (isNaN(vid) || vid == 0) continue;

            if (vid < 0) { // remove vid
                iface.vlan.vids = iface.vlan.vids.filter(v => v !== Math.abs(vid));
            } else { // add vid
                if (!iface.vlan.vids.includes(vid)) {
                    iface.vlan.vids.push(vid);
                }
            }
        }

        if (iface.vlan.vids.length == 0) {
            delete iface.vlan
            proc.io.write(uint8_fromString(`${iface.id()}\tvlan removed`));
        } else {
            proc.io.write(uint8_fromString(`${iface.id()}\t${iface.vlan.type} ${iface.vlan.vids.join(",")}`));
        }

        return ProcessSignal.EXIT;
    },
    __NODATA__: true
}