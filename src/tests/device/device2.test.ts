import { describe, expect, test } from "vitest";
import { Device2, LoopbackInterface } from "../../lib/device/device2";
import { IPV4Address } from "../../lib/address/ipv4";
import { createMask } from "../../lib/address/mask";
import { IPV6Address } from "../../lib/address/ipv6";

let device = new Device2();
let lb_iface = new LoopbackInterface(device);
lb_iface.up = true; // this is something that is required

let lb_address4 = new IPV4Address("127.0.0.1"),
    lb_netmask4 = createMask(IPV4Address, 8),
    lb_address6 = new IPV6Address("::1"),
    lb_netmask6 = createMask(IPV6Address, IPV6Address.ADDRESS_LENGTH)

describe("Device2 route_resolve", () => {

    test("host", () => {
        device.routes = [{
            destination: new IPV4Address("127.0.0.100"),
            gateway: new IPV4Address("0.0.0.0"),
            netmask: createMask(IPV4Address, IPV4Address.ADDRESS_LENGTH),
            iface: lb_iface,
            f_host: true
        }]
        let route = device.route_resolve(new IPV4Address("127.0.0.100"));
        expect(route).toBeTruthy();
        expect(device.route_resolve(new IPV4Address("127.0.0.100"))?.gateway.toString()).eq("0.0.0.0")
    })

    test("default gateway", () => {
        device.routes = [{
            destination: new IPV4Address("0.0.0.0"),
            gateway: new IPV4Address("127.0.0.1"),
            netmask: createMask(IPV4Address, 0),
            iface: lb_iface,
            f_gateway: true
        }]
        expect(device.route_resolve(new IPV4Address("192.168.1.1"))?.gateway.toString()).eq("127.0.0.1")
    })

    test("longest match", () => {
        device.routes = [{
            destination: new IPV4Address("127.0.0.0"),
            gateway: new IPV4Address("127.0.0.10"),
            netmask: createMask(IPV4Address, 8),
            iface: lb_iface,
            f_gateway: true
        },
        {
            destination: new IPV4Address("127.0.30.0"),
            gateway: new IPV4Address("127.0.0.30"),
            netmask: createMask(IPV4Address, 8),
            iface: lb_iface,
            f_gateway: true
        },
        {
            destination: new IPV4Address("127.0.20.0"),
            gateway: new IPV4Address("127.0.0.20"),
            netmask: createMask(IPV4Address, 8),
            iface: lb_iface,
            f_gateway: true
        },
        {
            destination: new IPV4Address("127.0.20.128"),
            gateway: new IPV4Address("127.0.0.128"),
            netmask: createMask(IPV4Address, 8),
            iface: lb_iface,
            f_gateway: true
        }]

        expect(device.route_resolve(new IPV4Address("127.0.0.1"))?.gateway.toString()).eq("127.0.0.10")
        expect(device.route_resolve(new IPV4Address("127.0.30.1"))?.gateway.toString()).eq("127.0.0.30")
        expect(device.route_resolve(new IPV4Address("127.0.20.1"))?.gateway.toString()).eq("127.0.0.20")
        expect(device.route_resolve(new IPV4Address("127.0.20.254"))?.gateway.toString()).eq("127.0.0.128")
    })
})

describe("Device2 interface_set_address", () => {
    device.routes = [];

    test("reuse entry & set new entry", () => {
        lb_iface.addresses = [
            { address: lb_address4, netmask: lb_netmask4 }
        ]; // the function assumes there is only one address type per interface

        device.interface_set_address(lb_iface, lb_address4, lb_netmask4);
        expect(lb_iface.addresses.length).eq(1)
        device.interface_set_address(lb_iface, lb_address6, lb_netmask6);
        expect(lb_iface.addresses.length).eq(2)
    })

    test("remove routes that are in a different network", () => {
        device.routes = [
            {
                destination: new IPV4Address("10.0.0.0"),
                netmask: createMask(IPV4Address, 8),
                gateway: new IPV4Address("0.0.0.0"),
                iface: lb_iface
            },
            {
                destination: new IPV4Address("0.0.0.0"),
                netmask: createMask(IPV4Address, 0),
                gateway: new IPV4Address("10.0.0.1"),
                iface: lb_iface,
                f_gateway: true
            },
        ];

        device.interface_set_address(lb_iface, lb_address4, lb_netmask4);
        expect(device.routes.length).eq(1); // 2 - 2 + 1 = 1
    })
})

describe("Device2 contact_bind", () => {
    let contact = device.contact_create("IPv4", "UDP").data!;

    test("successful bind", () => {
        let caddr =  {
            daddr: lb_address4,
            saddr: lb_address4,
            dport: 2000,
            sport: 2000
        };
        let result = device.contact_bind(contact,caddr);

        expect(result.success, result.message).true;
        expect(caddr === result.data).true;
    });

    test("server listening with outgoing contacts", () => {
        let caddrs = [
            { daddr: new IPV4Address("0.0.0.0"), saddr: new IPV4Address("0.0.0.0"), dport: 0, sport: 3000 },
            { daddr: lb_address4, saddr: new IPV4Address("0.0.0.0"), dport: 8989, sport: 3000 },
            { daddr: lb_address4, saddr: new IPV4Address("0.0.0.0"), dport: 7878, sport: 3000 },
        ];

        for (let caddr of caddrs) {
            let r = device.contact_create("IPv4", "UDP");
            expect(r.success, r.message).true;
            let ra = device.contact_bind(r.data!, caddr);
            expect(ra.success, ra.message).true;
        }
    });

    test("contact already in use", () => {
        contact = device.contact_create("IPv4", "UDP").data!;
        let r = device.contact_bind(contact, {
            saddr: new IPV4Address("0.0.0.0"), daddr: lb_address4, sport: 6000, dport: 80
        })
        
        expect(r.success, r.message).true;
        
        contact = device.contact_create("IPv4", "UDP").data!;
        r = device.contact_bind(contact, {
            saddr: new IPV4Address("0.0.0.0"), daddr: lb_address4, sport: 6000, dport: 80
        });

        expect(r.success, r.message).false;
    })
});

