import { BaseAddress } from "../address/base";

export enum PacketCaptureRecordStatus{
    NORMAL,
    WARNING,
    ERROR,
}

export interface PacketCaptureRecordMetaData {
    index: number;
    timestamp: Date;
    length: number;
    fullLength: number;
}

export interface PacketCaptureRecordData {
    saddr: BaseAddress;
    daddr: BaseAddress;
    protocol: string;
    status: PacketCaptureRecordStatus;

    info: string[];
}

export type PacketCaptureRecord = PacketCaptureRecordMetaData & PacketCaptureRecordData;