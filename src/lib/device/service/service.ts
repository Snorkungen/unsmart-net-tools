import { Device } from "../device";

export default interface DeviceService {
    device: Device;
    config?: unknown;
}