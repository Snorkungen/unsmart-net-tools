import { BaseAddress } from "../../address/base";
import { IPV4Address } from "../../address/ipv4";
import { IPV6Address } from "../../address/ipv6";
import { calculateChecksum } from "../../binary/checksum";
import { uint8_fromString } from "../../binary/uint8-array";
import { ICMP_ECHO_HEADER, ICMP_HEADER, ICMPV4_TYPES, ICMPV6_TYPES } from "../../header/icmp";
import { IPV4_HEADER, PROTOCOLS } from "../../header/ip";
import { Contact, ContactAddrFamily, ContactProto } from "../contact/contact";
import { DPSignal, DeviceProgram, DeviceProgramStatus } from "../device-program";
import { parseArgs } from "./helpers";

function sendPingIPV4(identifier: number, sequence: number, contact: Contact<ContactAddrFamily, ContactProto>, target: BaseAddress) {
    if (!(target instanceof IPV4Address)) { // Satisfying typescript
        return console.warn("Could not send request due to a logical impossibility")
    };
    let echoHdr = ICMP_ECHO_HEADER.create({
        id: identifier,
        seq: sequence,
    }), icmpHdr = ICMP_HEADER.create({
        type: ICMPV4_TYPES.ECHO_REQUEST,
        data: echoHdr.getBuffer()
    });

    icmpHdr.set("csum", calculateChecksum(icmpHdr.getBuffer()));

    let ipHdr = IPV4_HEADER.create({
        version: 4,
        ihl: 5,
        tos: 0,
        ttl: 64,
        daddr: target,
        proto: PROTOCOLS.ICMP,
        payload: icmpHdr.getBuffer()
    })

    contact.send(ipHdr.getBuffer())
}

function sendPingIPV6(identifier: number, sequence: number, contact: Contact<ContactAddrFamily, ContactProto>, target: BaseAddress) {
    if (!(target instanceof IPV6Address)) { // Satisfying typescript
        return console.warn("Could not send request due to a logical impossibility")
    };
    let echoHdr = ICMP_ECHO_HEADER.create({
        id: identifier,
        seq: sequence
    }), icmpHdr = ICMP_HEADER.create({
        type: ICMPV6_TYPES.ECHO_REQUEST,
        data: echoHdr.getBuffer()
    });

    throw new Error("IPV6 Raw contact not fully implemented")

    // let saddr = new IPV6Address("::");
    // // The actual spec <https://www.rfc-editor.org/rfc/rfc4443#section-2.3>
    // let pseudoHdr = IPV6_PSEUDO_HEADER.create({
    //     saddr: new IPV6Address("::"),
    //     daddr: target,
    //     len: icmpHdr.size,
    //     nextHeader: PROTOCOLS.IPV6_ICMP,
    // })

    // icmpHdr.set("csum", calculateChecksum(Buffer.concat([pseudoHdr.getBuffer(), icmpHdr.getBuffer()])));

    // let ipHdr = IPV6_HEADER.create({
    //     saddr: saddr,
    //     daddr: target,
    //     nextHeader: PROTOCOLS.IPV6_ICMP,
    //     payload: icmpHdr.getBuffer()
    // })
}

export const DEVICE_PROGRAM_PING: DeviceProgram = {
    name: "ping",
    description: "Sends icmp echo requests to target",
    content: `
    <ping [destination] ?[sendCount]>
    <ping 192.168.1.1>
    <ping ::1 4>
    `,
    run(args, { terminal, signal, device }) {
        return new Promise((resolve) => {
            let contact: Contact<ContactAddrFamily, ContactProto> | undefined;
            let identifier = Math.floor(Math.random() * (2 ** 16)), sequence = 0;

            let [, target, sendCount] = parseArgs(args);

            const timestamps = new Map<number, number>();

            let targetAddress: IPV4Address | IPV6Address;
            let requestSender: (identifier: number, sequence: number, contact: Contact<ContactAddrFamily, ContactProto>, target: BaseAddress) => void;

            if (IPV4Address.validate(target)) {
                contact = device.contactsHandler.createContact(ContactAddrFamily.IPv4, ContactProto.RAW);
                targetAddress = new IPV4Address(target);
                requestSender = sendPingIPV4;
            } else if (IPV6Address.validate(target)) {
                contact = device.contactsHandler.createContact(ContactAddrFamily.IPv6, ContactProto.RAW);
                targetAddress = new IPV6Address(target);
                requestSender = sendPingIPV6;
            } else {
                // maybe in future dns resolution
                terminal.write(uint8_fromString(
                    "Failed to parse given address: " + target
                ));
                return resolve(DeviceProgramStatus.ERROR);
            }

            let cancelled = false;
            
            signal.on(DPSignal.TERMINATE, () => {
                // Teardown
                contact && device.contactsHandler.closeContact(contact)
                cancelled = true;
                return resolve(DeviceProgramStatus.ERROR);
            })


            if (contact.addrFamily == ContactAddrFamily.IPv4) {
                contact.recieve = (buf) => {
                    if (cancelled) return;

                    let ipHdr = IPV4_HEADER.from(buf);
                    if (ipHdr.get("proto") != PROTOCOLS.ICMP) {
                        return; // ignore
                    }

                    let icmpHdr = ICMP_HEADER.from(ipHdr.get("payload"));

                    if (icmpHdr.get("type") != ICMPV4_TYPES.ECHO_REPLY) {
                        // return for now but in the future should also be able to recieve errors                            
                        return; // ignore
                    }

                    let echoHdr = ICMP_ECHO_HEADER.from(icmpHdr.get("data"));

                    if (echoHdr.get("id") != identifier) {
                        return; // ignore
                    }

                    let sendTime = timestamps.get(echoHdr.get("seq"));
                    if (!sendTime) {
                        console.warn("unexpected behaviour send time undefined")
                        sendTime = 0;
                    }

                    let time = Date.now() - sendTime;

                    terminal.write(uint8_fromString(
                        `${ipHdr.get("payload").length} bytes from ${ipHdr.get("saddr")}: seq=${echoHdr.get("seq")} ttl=${ipHdr.get("ttl")} time=${time} ms\n`
                    ))

                    sendRequest()
                }
            } else if (contact.addrFamily == ContactAddrFamily.IPv6) {
                contact.recieve = (buf) => {
                    if (cancelled) return;
                }
            }

            let maxSendCount = 10;

            let n = parseInt(sendCount);
            if (!isNaN(n)) {
                maxSendCount = n;
            }

            // const interval = window.setInterval(sendRequest, 150);

            function sendRequest() {
                if (sequence < maxSendCount) {
                    requestSender(identifier, ++sequence, contact!, targetAddress)
                    timestamps.set(sequence, Date.now())
                    return;
                }

                // clean up 
                // window.clearInterval(interval);
                contact?.close()

                resolve(DeviceProgramStatus.OK)
            }


            return sendRequest()
        })
    },
}