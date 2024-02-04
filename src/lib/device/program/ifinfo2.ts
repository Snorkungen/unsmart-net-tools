import { BaseAddress } from "../../address/base";
import { IPV4Address } from "../../address/ipv4";
import { AddressMask, createMask } from "../../address/mask";
import { uint8_fromString, uint8_readUint32BE } from "../../binary/uint8-array";
import { EthernetInterface, Process, ProcessSignal, Program } from "../device2";
import { formatTable } from "./helpers";

function cidrNotate(addr?: BaseAddress, len?: number): string {
    if (!addr) return "";
    let str = addr.toString();
    if (len) {
        str += "/" + len.toString();
    }
    return str;
}

function twrite(proc: Process, str: string) { proc.term_write(uint8_fromString(str)); }

const DEVICE_PROGRAM_IFINFO_SET4: Program = {
    name: "set4",
    description: "This program sets the ipv4 address and mask",
    content: `<ifinfo set4 [interface id] [address] [mask or mask length]>
<ifinfo set4 eth0 172.16.1.250 255.255.128.0>
<ifinfo set4 eth0 192.168.1.100 24>`,

    init(proc, args) {
        let [, , id, addr, mask] = args;

        if (!id) {
            twrite(proc, `IF_ID: missing\n${this.content}`);
            return ProcessSignal.ERROR;
        } else if (!addr) {
            twrite(proc, `Address: missing\n${this.content}`);
            return ProcessSignal.ERROR;
        } else if (!mask) {
            twrite(proc, `Mask: missing\n${this.content}`);
            return ProcessSignal.ERROR;
        }

        let iface = proc.device.interfaces.find(iface => iface.id() == id);
        if (!iface) {
            twrite(proc, `IF_ID: (${id}) is invalid`)
            return ProcessSignal.ERROR;
        }

        if (!IPV4Address.validate(addr)) {
            twrite(proc, `address: (${addr}) is invalid`)
            return ProcessSignal.ERROR;
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

        if (!amask || !amask.isValid()) {
            twrite(proc, `mask: (${mask}) is invalid`);
            return ProcessSignal.ERROR;
        }

        let oldAddr = iface.addresses.find((a) => a.address instanceof IPV4Address);
        let address = new IPV4Address(addr);
        let res = proc.device.interface_set_address(iface, address, amask);
        if (!res.success) {
            res.message && twrite(proc, res.message)
            return ProcessSignal.EXIT;
        }

        // !TODO: this thing may or may not be able to set dhcp mode

        twrite(proc, `(${cidrNotate(address, amask.length)})
        To revert. => ifinfo ${this.name} ${id} ${oldAddr?.address || "0.0.0.0"} ${oldAddr?.netmask || "0.0.0.0"}`)

        // easter egg remove ip configuration, but it won't work due to the mask check quitting early

        if (uint8_readUint32BE(address.buffer) == 0) {
            let idx = iface.addresses.findIndex((a) => a.address.constructor == address.constructor);
            if (idx >= 0) {
                delete iface.addresses[idx];
            }
        }

        return ProcessSignal.EXIT;
    }
}

export const DEVICE_PROGRAM_IFINFO: Program = {
    name: "ifinfo",
    description: "displays information about the devices interfaces",
    content: `<ifinfo>  Lists all interfaces 
<ifinfo [...ifID]>  displays information about the specified interfaces`,
    init(proc, argv) {
        argv.shift();

        let interfaces = proc.device.interfaces;

        if (argv.length) {
            interfaces = interfaces.filter(f => argv.includes(f.id()));
        }

        for (let iface of interfaces) {
            let ifid = iface.id();

            let table: (string | undefined)[][] = [[ifid]];
            let info: unknown[], tr = 0;
            if (iface instanceof EthernetInterface) {
                // display ethernet related information
                info = [
                    iface.macAddress
                ]; // !TODO: display vlan information

                table[tr++][1] = info.join(" ");
            } else {
                tr++;
            }

            for (let address of iface.addresses) {
                info = [
                    cidrNotate(address.address, address.netmask.length),
                    proc.device.routes.find(r => r.iface == iface && r.f_gateway)?.gateway
                    // dhcp could possible be put here on the address or maybe seperate
                ];

                table[tr] = [];
                table[tr++][1] = info.filter(Boolean).join(" ");
            }

            proc.term_write(formatTable(table));
        }
        return ProcessSignal.EXIT;
    },
    sub: [DEVICE_PROGRAM_IFINFO_SET4]
}