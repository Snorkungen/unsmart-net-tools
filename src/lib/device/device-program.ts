import type { Device } from "./device";

// DeviceProgram => DP
export enum DPSignal {
    UNSPECIFIED,
    TERMINATE
}

export class DeviceProgramSignal {
    state: DPSignal = DPSignal.UNSPECIFIED;

    send(sig: DPSignal): number {
        this.state = sig;
        let count = 0;
        for (let listener of this.listeners) {
            if (listener[0] == sig || listener[0] == DPSignal.UNSPECIFIED) {
                listener[1](sig);
                count++;
            }
        }
        return count;
    }

    private listeners: (
        Parameters<DeviceProgramSignal["on"]>
    )[] = [];


    on(sig: DPSignal, fn: (sig: DPSignal) => void): number {
        return this.listeners.push([sig, fn])
    }

    remove(n: ReturnType<DeviceProgramSignal["on"]>) {
        delete this.listeners[n];
    }
}

export enum DeviceProgramStatus {
    OK,
    ERROR = -1,
    CANCELED
}

export interface DeviceProgramTerminal {
    write(bytes: Uint8Array): void;
    flush(): void;
    read?(bytes: Uint8Array): void;
}

export type DeviceProgramOptions = {
    terminal: DeviceProgramTerminal;
    device: Device;
    signal: DeviceProgramSignal;
}
export interface DeviceProgram {
    run(args: string, options: DeviceProgramOptions): Promise<DeviceProgramStatus>
    name: string;
    description?: string;
    content?: string;
    sub?: DeviceProgram[];
}

