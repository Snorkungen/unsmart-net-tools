import { uint8_fromString } from "../../binary/uint8-array";
import { DeviceProgram, DeviceProgramStatus, DeviceProgramTerminal } from "../device-program";
import { leftOffsetStr, parseArgs, tabAlign } from "./helpers";



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
                let leftOffset = tabAlign(ifID.length)

                // write if id
                terminal.write(uint8_fromString(ifID + "\t"))

                // write macaddress and vlan info
                let info: { toString(): string }[] = [iface.macAddress];
                if (iface.vlan) {
                    info.push(
                        iface.vlan.type,
                        iface.vlan.vids.join(",")
                    )
                }

                terminal.write(leftOffsetStr(info.join(" "), leftOffset))

                // write ipv4 info
                info = [
                    iface.ipv4Address!,
                    iface.ipv4SubnetMask!,
                    iface.ipv4GW!,
                    (iface.dhcp?.includes(4) && "dhcp")!
                ].filter(Boolean)

                if (info.length) {
                    terminal.write(leftOffsetStr(info.join(" "), leftOffset))
                }

                // write ipv6 info
                info = [
                    iface.ipv6Address!,
                    iface.prefixLength!,
                    (iface.dhcp?.includes(6) && "dhcp")!
                ].filter(Boolean)

                if (info.length) {
                    terminal.write(leftOffsetStr(info.join(" "), leftOffset))
                }
            }

            return resolve(DeviceProgramStatus.OK);
        })
    },
}