import { BaseAddress } from "../../address/base";
import { IPV4Address } from "../../address/ipv4";
import { address_is_unset, ProcessSignal, Program } from "../device";
import { EthernetInterface, VlanInterface } from "../interface";
import { device_program_register } from "../internals/program";
import { ppbind, PPFactory, ProgramParameterDefinition } from "../internals/program-parameters";
import { formatTable, ioprintln } from "./helpers";

function cidrNotate(addr?: BaseAddress, len?: number): string {
    if (!addr) return "";
    let str = addr.toString();
    if (len) {
        str += "/" + len.toString();
    }
    return str;
}

const PPBaseInterface = PPFactory.create("IFID", PPFactory.parse_baseiface)

const pdef = new ProgramParameterDefinition([
    ppbind(["ifinfo", PPFactory.optional(PPFactory.multiple(PPBaseInterface))], "display interface configuration"),
    ppbind(["ifinfo", "set4", PPBaseInterface, PPFactory.ipv4("address"), PPFactory.create("mask", PPFactory.parse_amask_ip4)], "set ipv4 address"),
])

export const DEVICE_PROGRAM_IFINFO: Program = device_program_register({
    name: "ifinfo",
    parameters: pdef,
    init(proc, sargs) {
        sargs[0] = "ifinfo"
        let res = pdef.parse(proc.device, sargs);

        if (!res.success) {
            ioprintln(proc.io, pdef.message(res));
            return ProcessSignal.ERROR;
        }

        let args = res.arguments;

        // set IPv4 address
        if (args[1] == "set4") {
            let [pname, pname1, iface, address, mask] = args;

            let oldAddr = iface.addresses.find((a) => a.address instanceof IPV4Address);
            if (oldAddr) {
                oldAddr = {
                    address: new IPV4Address(oldAddr.address.toString()),
                    netmask: oldAddr.netmask
                }
            }

            if (address_is_unset(address) && mask.buffer[0] == 0) {
                // Remove current adddress
                if (!!oldAddr) {
                    let res = proc.device.interface_address_remove(iface, oldAddr.address);
                    if (!res.success) {
                        res.message && ioprintln(proc.io, res.message)
                    }
                }
            } else {
                let res = proc.device.interface_address_set(iface, address, mask);
                if (!res.success) {
                    res.message && ioprintln(proc.io, res.message)
                    return ProcessSignal.EXIT;
                }
            }

            ioprintln(proc.io, `(${cidrNotate(address, mask.length)})`)
            ioprintln(proc.io, `To revert. => ${pname} ${pname1} ${iface.id()} ${oldAddr?.address || "0.0.0.0"} ${oldAddr?.netmask || "0.0.0.0"}`)

            return ProcessSignal.EXIT;
        }

        let interfaces = proc.device.interfaces;

        if (args[1]) {
            interfaces = interfaces.filter(f => args[1]?.find(v => v == f));
        }

        let table: (string | undefined)[][] = []

        for (let iface of interfaces) {
            let ifid = iface.id();

            table.push([ifid])
            let info: unknown[], tr = table.length - 1;
            if (iface instanceof EthernetInterface) {
                // display ethernet related information
                info = [
                    (iface.up ? "active" : "down"),
                    iface.macAddress
                ];

                if (iface.vlan)
                    info.push(
                        `vlan(${iface.vlan.type} ${iface.vlan.vids.join(",")})`
                    )

                table[tr][1] = info.join(" ");
            } else if (iface instanceof VlanInterface) {
                table[tr][1] = `vlan(${iface.vid})`
                // !TODO: future could display short info about info macaddress 
            }

            for (let address of iface.addresses) {
                info = [
                    cidrNotate(address.address, address.netmask.length),
                    proc.device.routes.find(r => r.iface == iface && r.f_gateway)?.gateway
                    // dhcp could possible be put here on the address or maybe seperate
                ];

                table.push([undefined, info.filter(Boolean).join(" ")])
            }

        }
        proc.io.write(formatTable(table));

        return ProcessSignal.EXIT;
    },
})