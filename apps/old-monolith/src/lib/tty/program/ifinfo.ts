import { BaseAddress } from "../../address/base";
import { IPV4Address } from "../../address/ipv4";
import { AddressMask } from "../../address/mask";
import { createMask } from "../../address/mask";
import { TTYProgram, TTYProgramInitializer, TTYProgramMetaData, TTYProgramStatus, createTTYProgram, formatTable, parseArgs } from "./program";

function cidrNotate(addr?: BaseAddress, len?: number): string {
    if (!addr) return "";

    let str = addr.toString();

    if (len) {
        str += "/" + len.toString();
    }

    return str;
}

const setIpv4 = createTTYProgram((writer, device) => ({
    cancel() { },
    run(args) {
        return new Promise(resolve => {
            this.cancel = () => { resolve(TTYProgramStatus.CANCELED) };
            let [, , , id, addr, mask] = parseArgs(args);

            if (!id) {
                writer.write(`IF_ID: missing`)
                return resolve(TTYProgramStatus.ERROR);
            } else if (!addr) {
                writer.write(`Address: missing`)
                return resolve(TTYProgramStatus.ERROR);
            } else if (!mask) {
                writer.write(`Mask: missing`)
                return resolve(TTYProgramStatus.ERROR);
            }

            let iface = device.interfaces.find(({ ifID }) => ifID + "" == id);

            if (!iface) {
                writer.write(`IF_ID: (${id}) is invalid`)
                return resolve(TTYProgramStatus.ERROR);
            }

            if (!IPV4Address.validate(addr)) {
                writer.write(`address: (${addr}) is invalid`)
                return resolve(TTYProgramStatus.ERROR);
            }

            let amask: AddressMask<typeof IPV4Address> | undefined;

            if (IPV4Address.validate(mask)) {
                amask = createMask(IPV4Address, mask);
            } else {
                let n = parseInt(mask);
                if (!isNaN(n)) {
                    amask = createMask(IPV4Address, n);
                }
            }

            if (!amask || !amask.isValid() || amask.length == 0) {
                writer.write(`mask: (${mask}) is invalid`)
                return resolve(TTYProgramStatus.ERROR);
            }

            iface.ipv4Address = new IPV4Address(addr);
            iface.ipv4SubnetMask = amask;

            writer.write(`Address: ${iface.ipv4Address} & Subnet Mask: ${iface.ipv4SubnetMask} set. (${cidrNotate(iface.ipv4Address, iface.ipv4SubnetMask.length)})`)
            resolve(TTYProgramStatus.OK);
        })
    }
}), {
    about: {
        description: "set IPv4 address",
        content: `
        <... ... ipv4 [IF_ID] [ipAddress] [subnetMask | subnetlength]>
        <... ... ipv4 0 192.168.1.100 255.255.255.0>
        <... ... ipv4 0 192.168.1.100 24>`
    }
})

const set = createTTYProgram((writer, device, programs) => ({
    cancel() { },
    run(args) {
        return programs.help(writer, device, programs).run("help " + args)
    },
}), {
    about: {
        description: "Program context for setting interface info",
        content: "<... set [program]>"
    },
    sub: {
        "ipv4": setIpv4
    }
})

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
        "brief": brief,
        "set": set
    },
    about: {
        description: "displays information about the devices interfaces",
        content: `
        <ifinfo>            displays all interface and condensed information about interfaces
        <ifinfo [...ifID]>  displays information about the specified interfaces
        `
    },
})
