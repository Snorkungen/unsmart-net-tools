import { describe, test, expect } from "vitest";
import { IPV4Address, calculateSubnetIPV4, IPV4_CLASS_A, IPV4_CLASS_B, IPV4_CLASS_C, classifyIPV4Address, reservedAddresses } from "../../lib/address/ipv4";
import { createMask } from "../../lib/address/mask";
import { createLinkLocalIPV4Address } from "../../lib/address/ipv4/link-local";

describe("IPV4 Address", () => {
    test("toString", () => {
        let addr = "9.0.0.2";
        let buf = new Uint8Array([9, 0, 0, 2]);
        expect(new IPV4Address(buf).toString()).eq(addr)
    })
    test("parser", () => {
        let addr = "192.168.30.179";
        let mac = new IPV4Address(addr);
        expect(mac.toString() == addr)
    })

    describe("Calculate Subnet", () => {
        test("Calculate Subnet #1", () => {
            let address = new IPV4Address("192.168.0.1"),
                mask = createMask(IPV4Address, 24, false);

            let subnet = calculateSubnetIPV4(address, mask);

            expect(address).not.eq(subnet.address)
            expect(address.toString()).eq(subnet.address.toString());

            expect(subnet.networkAddress.toString()).eq("192.168.0.0")
            expect(subnet.broadcastAddress.toString()).eq("192.168.0.255")

            expect(subnet.hosts.count).eq(254);
            expect(subnet.hosts.min.toString()).eq("192.168.0.1");
            expect(subnet.hosts.max.toString()).eq("192.168.0.254");
        })

        test("Calculate Subnet #2", () => {
            let address = new IPV4Address("192.168.0.40"),
                mask = createMask(IPV4Address, 30, false);

            let subnet = calculateSubnetIPV4(address, mask);

            expect(address).not.eq(subnet.address)
            expect(address.toString()).eq(subnet.address.toString());

            expect(subnet.networkAddress.toString()).eq("192.168.0.40")
            expect(subnet.broadcastAddress.toString()).eq("192.168.0.43")

            expect(subnet.hosts.count).eq(2);
            expect(subnet.hosts.min.toString()).eq("192.168.0.41");
            expect(subnet.hosts.max.toString()).eq("192.168.0.42");
        })
    })

    describe("Classify IPV4 Address", () => {
        test("Classify IPV4 Address #C", () => {
            let address = new IPV4Address("192.168.0.2")
            let c = classifyIPV4Address(address);

            expect(c == IPV4_CLASS_C).eq(true);
        })

        test("Classify IPV4 Address #B", () => {
            let address = new IPV4Address("172.16.0.1")
            let c = classifyIPV4Address(address);

            expect(c == IPV4_CLASS_B).eq(true);
        })

        test("Classify IPV4 Address #A", () => {
            let address = new IPV4Address("10.0.0.1")
            let c = classifyIPV4Address(address);

            expect(c == IPV4_CLASS_A).eq(true);
        })
    })

    test("create link-local", () => {
        const LINK_LOCAL_ENTRY = reservedAddresses.find(([, , scope]) => scope == "LINK_LOCAL")!
        let linkLocalMask = createMask(IPV4Address, LINK_LOCAL_ENTRY[1]);
        let linkLocalNetID = new IPV4Address(LINK_LOCAL_ENTRY[0]);

        for (let i = 0; i < 1_000; i++) {
            let llAddr = createLinkLocalIPV4Address();
            expect(linkLocalMask.compare(linkLocalNetID, llAddr)).to.eq(true);
            expect(llAddr.buffer[3], llAddr.toString()).not.eq(255)
            expect(llAddr.buffer[3], llAddr.toString()).not.eq(0)
        }
    })
})