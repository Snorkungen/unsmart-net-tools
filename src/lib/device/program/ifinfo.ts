import { BaseAddress } from "../../address/base";
import { IPV4Address } from "../../address/ipv4";
import { AddressMask, createMask } from "../../address/mask";
import { uint8_readUint32BE } from "../../binary/uint8-array";
import { DeviceProgram, DeviceProgramStatus } from "../device-program";
import { formatTable, parseArgs, twrite } from "./helpers";

function cidrNotate(addr?: BaseAddress, len?: number): string {
    if (!addr) return "";

    let str = addr.toString();

    if (len) {
        str += "/" + len.toString();
    }

    return str;
}

const DEVICE_PROGRAM_IFINFO_SET4: DeviceProgram = {
    name: "set4",
    description: "This program sets the ipv4 address and mask",
    content: `<ifinfo set4 [interface id] [address] [mask or mask length]>
<ifinfo set4 0 172.16.1.250 255.255.128.0>
<ifinfo set4 0 192.168.1.100 24>`,

    run(args, options) {
        return new Promise((resolve) => {
            let [, , id, addr, mask] = parseArgs(args);

            if (!id) {
                twrite(options.terminal, `IF_ID: missing\n${this.content}`);
                return resolve(DeviceProgramStatus.ERROR);
            } else if (!addr) {
                twrite(options.terminal, `Address: missing\n${this.content}`);
                return resolve(DeviceProgramStatus.ERROR);
            } else if (!mask) {
                twrite(options.terminal, `Mask: missing\n${this.content}`);
                return resolve(DeviceProgramStatus.ERROR);
            }

            let iface = options.device.interfaces.find(({ ifID }) => ifID + "" == id);

            if (!iface) {
                twrite(options.terminal, `IF_ID: (${id}) is invalid`)
                return resolve(DeviceProgramStatus.ERROR);
            }

            if (!IPV4Address.validate(addr)) {
                twrite(options.terminal, `address: (${addr}) is invalid`);
                return resolve(DeviceProgramStatus.ERROR);
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
                twrite(options.terminal, `mask: (${mask}) is invalid`);
                return resolve(DeviceProgramStatus.ERROR);
            }

            let oldAddr = iface.ipv4Address, oldMask = iface.ipv4SubnetMask;

            iface.ipv4Address = new IPV4Address(addr);
            iface.ipv4SubnetMask = amask;

            /**
             * In future when i make this thing aware of DHCP
             * Ensure that dhcp for is released
             */
            

            twrite(options.terminal, `(${cidrNotate(iface.ipv4Address, iface.ipv4SubnetMask.length)})
To revert. => ifinfo ${this.name} ${id} ${oldAddr || "0.0.0.0"} ${oldMask || "0.0.0.0"}`)

            // easter egg remove ip configuration
            if (uint8_readUint32BE(iface.ipv4Address!.buffer) == 0) {
                delete iface.ipv4Address;
                delete iface.ipv4SubnetMask;
            };

            resolve(DeviceProgramStatus.OK);
        })
    },
}

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
    sub: [DEVICE_PROGRAM_IFINFO_SET4]
}