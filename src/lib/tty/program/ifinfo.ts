import { BaseAddress } from "../../address/base";
import { TTYProgram, TTYProgramInitializer, TTYProgramMetaData, TTYProgramStatus, formatTable, parseArgs } from "./program";

function cidrNotate(addr?: BaseAddress, len?: number): string {
    if (!addr) return "";

    let str = addr.toString();

    if (len) {
        str += "/" + len.toString();
    }

    return str;
}


export const brief: TTYProgram = Object.assign<TTYProgramInitializer, TTYProgramMetaData>((writer, device) => {
    return {
        cancel() { },
        run(args) {
            return new Promise(resolve => {
                this.cancel = () => { resolve(TTYProgramStatus.CANCELED) };

                let [, , argv] = parseArgs(args);

                let row = ["IF_ID", "MAC", "IPv4", "IPv6", "VLAN"];
                let rows = device.interfaces.map((iface) => (
                    [iface.ifID.toString(), iface.macAddress.toString(),
                    cidrNotate(iface.ipv4Address, iface.ipv4SubnetMask?.length,),
                    cidrNotate(iface.ipv6Address, iface.prefixLength),
                    iface.vlan ? iface.vlan.type : ""
                    ]
                ));


                let str = formatTable([row].concat(rows), "  ")

                writer.write(str)

                resolve(TTYProgramStatus.OK);
            })
        },
    }
}, {
    about: {
        description: "Displays information about an interface.",
        content: "",
    },
})


export const ttyProgramIfinfo: TTYProgram = Object.assign<TTYProgramInitializer, TTYProgramMetaData>(
    (writer, device, programs) => ({
        cancel() { },
        run(args) {
            return new Promise(resolve => {
                this.cancel = () => { resolve(TTYProgramStatus.CANCELED) };

                programs.help(writer, device, programs).run(`help ${args}`)

                resolve(TTYProgramStatus.OK)
            })
        },
    }), {
    sub: {
        "brief": brief
    },
    about: {
        description: "displays information about the devices interfaces",
        content: `
                ifinfo
                    displays all interface and condensed information about interfaces
                    [ifID]: [macAddress] ([ipv4Address]/[ipv4SubnetMask]) ([ipv6Address]/[ipv6SubnetMask])
                ifinfo [...ifID]
                    displays information about the specified interfaces
                `
    },
})
