import { BaseAddress } from "../../address/base";
import { TTYProgram, TTYProgramStatus, formatTable, parseArgs } from "./program";

let cancel = () => { };

export const ttyProgramIfinfo: TTYProgram = (writer, device) => ({
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
    cancel,
    run(args) {
        return new Promise(resolve => {
            cancel = () => { resolve(TTYProgramStatus.CANCELED) };

            let input = parseArgs(args).slice(1);



            if (input.length == 0) {
                writer.write(device.interfaces.sort((a, b) => b.ifID - a.ifID).map((iface) => {
                    let output = `${iface.ifID}:     ${iface.macAddress} `;
                    if (iface.ipv4Address) {
                        output += iface.ipv4Address.toString();
                        if (iface.ipv4SubnetMask) {
                            output += "/" + iface.ipv4SubnetMask.length;
                        }
                        output += " ";
                    }

                    if (iface.ipv6Address) {
                        output += iface.ipv6Address.toString(4);
                        if (iface.prefixLength) {
                            output += " " + iface.prefixLength;
                        }
                    }

                    return output;
                }).join("\n"))
            } else {
                writer.write(device.interfaces.filter(({ ifID }) => input.includes(ifID + "")).sort((a, b) => b.ifID - a.ifID).map((iface) => {
                    let output = `${iface.ifID}:     ${iface.macAddress}\n`;
                    if (iface.ipv4Address) {
                        output += iface.ipv4Address.toString();
                        if (iface.ipv4SubnetMask) {
                            output += " " + iface.ipv4SubnetMask.toString();
                        }
                        output += "\n";
                    }

                    if (iface.ipv6Address) {
                        output += iface.ipv6Address.toString(4);
                        if (iface.prefixLength) {
                            output += " " + iface.prefixLength;
                        }
                    }

                    return output;
                }).join("\n"))
            }

            resolve(TTYProgramStatus.OK)
        })
    },
    sub: {
        "brief": brief
    }
})

function cidrNotate(addr?: BaseAddress, len?: number): string {
    if (!addr) return "";

    let str = addr.toString();

    if (len) {
        str += "/" + len.toString();
    }

    return str;
}


export const brief: TTYProgram = (writer, device) => {
    return {
        about: {
            description: "Displays information about an interface.",
            content: "",
        },
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
}