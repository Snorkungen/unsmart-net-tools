import { uint8_fromString } from "../binary/uint8-array";
import { ASCIICodes, CSI } from "../terminal/shared";
import { DeviceProgram, DeviceProgramStatus } from "./device";

export const DEVICE_PROGRAM_CLEAR: DeviceProgram = {
    name: "clear",
    description: "This program clears the terminal.",
    run(args, options) {
        return new Promise((resolve) => {

            options.terminal.write(CSI(ASCIICodes.Two, 74)); // clear display
            return resolve(DeviceProgramStatus.OK);
        })
    },
}

export const DEVICE_PROGRAM_ECHO: DeviceProgram = {
    name: "echo",
    description: "This program writes to the terminal the inputed text.",
    run(args: string, options): Promise<DeviceProgramStatus> {
        return new Promise<DeviceProgramStatus>((resolve) => {

            options.terminal.write(uint8_fromString(args)); // echo
            resolve(DeviceProgramStatus.OK)
        })
    }
}

export const DEVICE_PROGRAM_HELP: DeviceProgram = {
    name: "help",
    description: "This program writes information about the available progrmas to screen",
    run(args, options): Promise<DeviceProgramStatus> {
        return new Promise<DeviceProgramStatus>((resolve) => {

            options.terminal.write(uint8_fromString(
                options.device.programs.map(({ name, description }) => name + "\t" + (description || "")).join("\n")
            ))

            resolve(DeviceProgramStatus.OK)
        })
    }
}
