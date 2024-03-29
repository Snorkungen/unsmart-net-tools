
export const ETHERNET_MTU = 0x600; // bytes
export const MIN_PAYLOAD_LENGTH = 0X2E; // 46;

export type EtherType = typeof ETHER_TYPES[keyof typeof ETHER_TYPES];

/** Source <https://en.wikipedia.org/wiki/EtherType> */
export const ETHER_TYPES = {
    "IPv4": 0x0800,
    "ARP": 0x0806,
    "WAKE_ON_LAN": 0x0842,
    "AVTP": 0x22F0,
    "IETF_TRILL": 0x22F3,
    "STREAM_RESERVATION": 0X22EA,
    "DEC_MOP": 0X6002,
    "DEC_NET": 0X6003,
    "DEC_LAT": 0X6004,
    "RARP": 0X8035,
    "APPLETALK": 0X809B,
    "AARP": 0X80F3,
    "VLAN": 0X8100,
    "SLPP": 0X8102,
    "VLACP": 0X8103,
    "IPX": 0X8137,
    "QNX": 0X8204,
    "IPv6": 0X86DD,
    "FLOW_CONTROL": 0X8808,
    "LACP": 0X8809,
    "COBRANET": 0X8819,
    "MPLS_UNICAST": 0X8847,
    "MPLS_MULTICAST": 0X8848,
    "PPPoE_DISCOVERY": 0X8863,
    "PPPoE_SESSION": 0X8864,
    "HOMEPLUG_MME": 0X887B,
    "EAPoLAN": 0X888E,
    "PROFINET": 0X8892,
    "HYPER_SCSI": 0X889A,
    "ATA": 0X88A2,
    "ETHERCAT": 0X88A4,
    "SVLAN": 0X88A8,
    "POWERLINK": 0X88AB,
    "GOOSE": 0X88B8,
    "GSEMS": 0X88B9,
    "SV": 0X88BA,
    // "MIKROTIK": 0X88BF,
    "LLDP": 0X88CC,
    "SERCOS_III": 0X88CD,
    "HOMEPLUG_GREEN_PHY": 0X88E1,
    "MRP": 0X88E3, // IEC62439
    "MAC_SEC": 0x88E5,
    "PBB": 0x88E7,
    "PTP": 0x88F7,
    "NC-SI": 0x88F8,
    "PRP": 0x88FB,
    "CFM/OAM": 0x8902,
    "FCoE": 0x8906,
    "RoCE": 0x8915,
    "TTE": 0x891D,
    "1905.1": 0x893a,
    "HSR": 0x892F,
    "ECTP": 0x9000,
    "REDUNDANCY_TAG": 0xF1C1,
} as const;