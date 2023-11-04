import { uint8_fromString } from "../binary/uint8-array";
import { ASCIICodes, CSI } from "../terminal/shared";
import { Device, DeviceProgram, DeviceProgramStatus, DeviceProgramTerminal } from "./device";

export const PLACEHOLDER_DEVICE = new Device();
export const PLACEHOLDER_DEVICE_PROGRAM_TERMINAL: DeviceProgramTerminal = {
    write() { },
    flush() { }
}

export class DeviceProgramClear implements DeviceProgram {
    constructor(public device: Device) { }
    terminal: DeviceProgramTerminal = PLACEHOLDER_DEVICE_PROGRAM_TERMINAL;
    cancel() { }
    run(args: string): Promise<DeviceProgramStatus> {
        return new Promise<DeviceProgramStatus>((resolve) => {
            this.cancel = () => resolve(DeviceProgramStatus.CANCELED);

            this.terminal.write(CSI(ASCIICodes.Two, 74)); // clear display

            resolve(DeviceProgramStatus.OK)
        })
    }

    description = "This program clears the terminal."
}
export class DeviceProgramEcho implements DeviceProgram {
    constructor(public device: Device) { }
    terminal: DeviceProgramTerminal = PLACEHOLDER_DEVICE_PROGRAM_TERMINAL;
    cancel() { }
    run(args: string): Promise<DeviceProgramStatus> {
        return new Promise<DeviceProgramStatus>((resolve) => {
            this.cancel = () => resolve(DeviceProgramStatus.CANCELED);

            this.terminal.write(uint8_fromString(args)); // echo

            resolve(DeviceProgramStatus.OK)
        })
    }

    description = "This program writes to the terminal the inputed text."
}
export class DeviceProgramHelp implements DeviceProgram {
    constructor(public device: Device) { }
    terminal: DeviceProgramTerminal = PLACEHOLDER_DEVICE_PROGRAM_TERMINAL;
    cancel() { }
    run(args: string): Promise<DeviceProgramStatus> {
        return new Promise<DeviceProgramStatus>((resolve) => {
            this.cancel = () => resolve(DeviceProgramStatus.CANCELED);

            let names = Object.keys(this.device.programs);
            this.terminal.write(uint8_fromString(
                names.map(name => name + "\t" + this.device.programs[name].description).join("\n")
            ))

            resolve(DeviceProgramStatus.OK)
        })
    }

    description = "This program writes information about the available progrmas to screen"
}        