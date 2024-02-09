import type { BaseAddress } from "../address/base";
import { MACAddress } from "../address/mac";
import type { AddressMask } from "../address/mask";

export enum NetworkAddressFamily {
    UNSPECIFIED,
    IPv4,
    IPv6,
    /** For sneaking in an entire ethernet header */
    LINK,
}

export enum NetworkInterfaceType {
    ETHERNET = "eth",
    LOOPBACK = "lo"
}

export enum NetworkInterfaceFlag {
    /** the interface is for a broadcast network */
    BROADCAST = 1 << 0,
    /** the interace supports multicasting */
    MULTICAST = 1 << 1,
    /** the interface is for a point-to-point network */
    POINTTOPOINT = 1 << 2,
    /** the interface is for a loopback network */
    LOOPBACK = 1 << 3,
    /** a transmission is in progress */
    OACTIVE = 1 << 4,
    /** resources are allocated for this interface */
    RUNNING = 1 << 5,
    /**  the interface cannot recieve its own transmissions */
    SIMPLEX = 1 << 6,

    /** reserved for a interface type */
    LINK0 = 1 << 7,
    /** reserved for a interface type */
    LINK1 = 1 << 8,
    /** reserved for a interface type */
    LINK2 = 1 << 9,

    /** the interface is all multicast packets */
    ALLMULTI = 1 << 10,
    /** debugging is enabled on the interface */
    DEBUG = 1 << 11,
    /** do not use ARP on this device */
    NOARP = 1 << 12,
    /** avoid using trailer encapsulation */
    NOTRAILERS = 1 << 13,
    /** the interface recieves all network packets */
    PROMISCIOUS = 1 << 14,

    /** the interface is operating */
    UP = 1 << 15,
}

export enum NetworkDataType {
    /** extra-data protocol message */
    CONTROL,
    /** dynamic data allocation (whatever that means) */
    DATA,
    /** fragment reassembly header */
    FTABLE,
    /** packet header (pretty sure that this won't be used) */
    HEADER,
    /** socket name */
    SONAME,
    /** socket options */
    SOOPTS,
}
export enum NetworkDataFlag {
    /** sent or recieved as a link-level broadcast */
    BROADCAST = 1 << 0,
    /** sent or recieved as a link-level multicst */
    MULTICAST = 1 << 1,
}

/** My interpretation of MBUF */
export interface NetworkData {
    type: NetworkDataType;
    flags: number;
    rcvif?: NetworkInterface;
    buffer: Uint8Array;
}

export type NetworkGenericAddress = {
    family: NetworkAddressFamily;
    buffer: Uint8Array;
}

export type NetworkRouteEntry = {
    destination: BaseAddress;
    gateway: BaseAddress;
    netmask : AddressMask<typeof BaseAddress>
    interface: NetworkInterface;

    // flags
}

export interface NetworkInterfaceAddress<AT extends typeof BaseAddress> {
    /** reference to interface */
    netif: NetworkInterface;

    /** address of interface */
    address: AT;
    /** other end of p2p link, or broadcast address for interface */
    brodcast: AT;
    /** subnet mask */
    netmask: AddressMask<AT>

    // !TODO references to routing table (fig. 3.15) W. Richard Stevens, Gary R. Wright - TCP/IP Illustratet volume 2

    /** cost for interface */
    metric: number;
}

export interface NetworkInterface {
    /** Reference to device */
    // device: Device;

    name: string;
    unit: number;

    addresses: NetworkInterfaceAddress<typeof BaseAddress>[];

    flags: number;


    type: NetworkInterfaceType,
    // addressLength: number, // this might be superflous
    // headerLength: number,
    mtu: number,
    metric: number, // routing metric (external only)

    /** packets recieved on interface */
    stat_ipackets: number,
    /** input errors on interface */
    stat_ierrors: number,
    /** packets sent on interface */
    stat_opackets: number,
    /** output errors on interface */
    stat_oerrors: number,
    /** collisions on csma interfaces (this will be always be zeror because i'm not supporting csma) */
    stat_collisions: 0,
    /** bytes recieved */
    stat_ibytes: number,
    /** bytes sent */
    stat_obytes: number,
    /** packets recieved via multicast */
    stat_imcast: number,
    /** packets dropped on input, for this interface */
    stat_idrops: number,
    /** packets destined for unsopported protocol */
    stat_noproto: number,

    stat_lastchange: Date


    // !TODO: something, something Berkely Packet Filter

    /** output routine (enque) [i haven't made a decision i won't be using a queue] */
    output?: (
        netif: NetworkInterface,
        data: NetworkData,
        addr: NetworkGenericAddress,
        // rtentry (this is the routing table entry)
    ) => number;
    /** initiate the output routine */
    start?: (netif: NetworkInterface) => number;
    /** initiate the output routine */
    // ioctl?: () => number;
    // reset?: () => number;
    // watchdog?: () => number;
}

export interface NetworkInterfaceLoopback extends NetworkInterface {
    name: "lo",
    type: NetworkInterfaceType.LOOPBACK;
}

export interface NetworkInterfaceEthernet extends NetworkInterface {
    name: "eth";
    type: NetworkInterfaceType.ETHERNET;
    macaddress: MACAddress;

    // !TODO: there should be a reference an binding with a ("ETHERNET_PORT", "DEVICE_PORT")

    // !TODO: reference to multicast, which is probably not going to be implemented
}


function netifOutputLoopback(
    netif: NetworkInterface,
    data: NetworkData,
    destination: NetworkGenericAddress,
    // rtentry (this is the routing table entry)
): number {
    // !TODO: Something Berkely Packet Filter

    data.rcvif = netif;

    netif.stat_lastchange = new Date();
    netif.stat_opackets += 1;
    netif.stat_obytes += data.buffer.length;

    switch (destination.family) {
        case NetworkAddressFamily.IPv4:
            // !TODO: Forward data into device ipv4 input
            // netif.device
            break;
        case NetworkAddressFamily.IPv6:
            // !TODO: Forward data into device ipv6 input
            // netif.device
            break;
        default:
            throw new Error("Unrecognized address family")
    }

    netif.stat_ipackets += 1;
    netif.stat_ibytes += data.buffer.length;

    return 0;
}

function netifOutputEthernet(
    netif: NetworkInterface,
    data: NetworkData,
    destination: NetworkGenericAddress,
    // rtentry (this is the routing table entry)
): number {

    // verify that interface is up
    if ((netif.flags & NetworkInterfaceFlag.UP) == 0 ) {
        // !TODO: Do some type of error handling
        return 1;
    }

    netif.stat_lastchange = new Date();

    // !TODO: implemetn route entry to be able to complete this logic
    // (fig. 4.15, p.108)

    return 0;
}