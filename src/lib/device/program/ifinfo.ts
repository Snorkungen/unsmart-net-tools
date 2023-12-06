import { DeviceProgram, DeviceProgramStatus, DeviceProgramTerminal } from "../device-program";
import { formatTable, parseArgs } from "./helpers";



export const DEVICE_PROGRAM_IFINFO: DeviceProgram = {
    name: "ifinfo",
    description: "displays information about the devices interfaces",
    content: `<ifinfo>  Lists all interfaces 
<ifinfo [...ifID]>  displays information about the specified interfaces`,
    run(args, { device, terminal }) {
        return new Promise((resolve) => {
            let [, ...argv] = parseArgs(args);
            let interfaces = device.interfaces;

            if (argv.length) {
                interfaces = interfaces.filter(({ ifID }) => argv.includes(ifID.toString()))
            }

            for (let iface of interfaces) {
                let ifID = iface.ifID + ":";

                let table: (string | undefined)[][] = [
                    [ifID,],
                ]

                // write macaddress and vlan info
                let info: unknown[] = [
                    iface.macAddress,
                    iface.vlan?.type,
                    iface.vlan?.vids.join(",")
                ].filter(Boolean);

                table[0][1] = info.join(" ");

                // write ipv4 info
                info = [
                    iface.ipv4Address!,
                    iface.ipv4SubnetMask!,
                    iface.ipv4GW!,
                    (iface.dhcp?.includes(4) && "dhcp")!
                ].filter(Boolean)

                if (info.length) {
                    table.push([undefined, info.join(" ")])
                }

                // write ipv6 info
                info = [
                    iface.ipv6Address!,
                    iface.prefixLength!,
                    (iface.dhcp?.includes(6) && "dhcp")!
                ].filter(Boolean)

                if (info.length) {
                    table.push([undefined, info.join()])
                }

                terminal.write(formatTable(table))
            }

            return resolve(DeviceProgramStatus.OK);
        })
    },
}