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

                let [, , ...argv] = parseArgs(args);
                let interfaces = device.interfaces;

                if (argv.length) {
                    interfaces = interfaces.filter(({ ifID }) => argv.includes(ifID.toString()))
                }

                let row = ["IF_ID", "MAC", "IPv4", "IPv6", "VLAN"];
                let rows = interfaces.map((iface) => (
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
        description: "Displays in a brief format information about an interface.",
        content: `
        <... brief [...IF_ID]>
        `,
    },
})


export const ttyProgramIfinfo: TTYProgram = Object.assign<TTYProgramInitializer, TTYProgramMetaData>(
    (writer, device) => ({
        cancel() { },
        run(args) {
            return new Promise(resolve => {
                this.cancel = () => { resolve(TTYProgramStatus.CANCELED) };
                let table: string[][] = [];

                let [, ...argv] = parseArgs(args);
                let interfaces = device.interfaces;

                if (argv.length) {
                    interfaces = interfaces.filter(({ ifID }) => argv.includes(ifID.toString()))
                }

                for (let iface of interfaces) {
                    table.push(
                        [`${iface.ifID}`, [
                            iface.macAddress.toString(),
                            iface.ipv4Address?.toString(),
                            iface.ipv4SubnetMask?.toString(),
                            iface.ipv6Address?.toString(),
                            iface.prefixLength,
                            iface.vlan?.type,
                            iface.vlan?.vids
                        ].filter(Boolean).join()]
                    )
                }

                writer.write(formatTable(table))

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
        <ifinfo>            displays all interface and condensed information about interfaces
        <ifinfo [...ifID]>  displays information about the specified interfaces
        `
    },
})
