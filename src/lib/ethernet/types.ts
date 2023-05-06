
// source https://en.wikipedia.org/wiki/EtherType

export type EtherType = readonly [type: number, protocol: string];

export const ETHERNET_I_MAX_SIZE = 0x600; // bytes
export const MIN_PAYLOAD_LENGTH = 0X2E; // 46;

export const ETHER_TYPES = [
    [0x0800, "IPv4"],
    [0x0806, "ARP"],
    [0x0842, "WAKE_ON_LAN"],
    [0x22F0, "AVTP"],
    [0x22F3, "IETF_TRILL"],
    [0X22EA, "STREAM_RESERVATION"],
    [0X6002, "DEC_MOP"],
    [0X6003, "DEC_NET"],
    [0X6004, "DEC_LAT"],
    [0X8035, "RARP"],
    [0X809B, "APPLETALK"],
    [0X80F3, "AARP"],
    [0X8100, "VLAN"],
    [0X8102, "SLPP"],
    [0X8103, "VLACP"],
    [0X8137, "IPX"],
    [0X8204, "QNX"],
    [0X86DD, "IPv6"],
    [0X8808, "FLOW_CONTROL"],
    [0X8809, "LACP"],
    [0X8819, "COBRANET"],
    [0X8847, "MPLS_UNICAST"],
    [0X8848, "MPLS_MULTICAST"],
    [0X8863, "PPPoE_DISCOVERY"],
    [0X8864, "PPPoE_SESSION"],
    [0X887B, "HOMEPLUG_MME"],
    [0X888E, "EAPoLAN"],
    [0X8892, "PROFINET"],
    [0X889A, "HYPER_SCSI"],
    [0X88A2, "ATA"],
    [0X88A4, "ETHERCAT"],
    [0X88A8, "SVLAN"],
    [0X88AB, "POWERLINK"],
    [0X88B8, "GOOSE"],
    [0X88B9, "GSEMS"],
    [0X88BA, "SV"],
    // [0X88BF, "MIKROTIK"],
    [0X88CC, "LLDP"],
    [0X88CD, "SERCOS_III"],
    [0X88E1, "HOMEPLUG_GREEN_PHY"],
    [0X88E3, "MRP"], // IEC62439
    [0x88E5, "MAC_SEC"],
    [0x88E7, "PBB"],
    [0x88F7, "PTP"],
    [0x88F8, "NC-SI"],
    [0x88FB, "PRP"],
    [0x8902, "CFM/OAM"],
    [0x8906, "FCoE"],
    [0x8915, "RoCE"],
    [0x891D, "TTE"],
    [0x893a, "1905.1"],
    [0x892F, "HSR"],
    [0x9000, "ECTP"],
    [0xF1C1, "REDUNDANCY_TAG"]

] as const satisfies readonly EtherType[];