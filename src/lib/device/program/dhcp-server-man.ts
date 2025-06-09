import { IPV4Address } from "../../address/ipv4";
import { MACAddress } from "../../address/mac";
import { uint8_concat } from "../../binary/uint8-array";
import { DeviceIO, Program, ProcessSignal, Process } from "../device";
import { DAEMON_DHCP_SERVER, dhcp_server_client_delete, dhcp_server_client_init, dhcp_server_gateways4_set, dhcp_server_get_store_data, dhcp_server_iface_delete, dhcp_server_iface_init, dhcp_server_range4_add, dhcp_server_serialize_clid, DHCPServerClient, DHCPServerClientState, DHCPServerConfig } from "./dhcp-server";
import { ioprint, ioreadline, ioclearline, formatTable, ioprintln } from "./helpers";
import { run_menu, MenuFields } from "./menu";

const MAX_ATTEMPTS = 3;
async function dhcp_server_conf_read_address<Address extends typeof IPV4Address>(io: DeviceIO, message: string, a: Address): Promise<undefined | InstanceType<Address>> {
    let i = 0;
    for (i = 0; i < MAX_ATTEMPTS; i++) {
        ioprint(io, message)
        let [bytes] = await ioreadline(io);
        let str = String.fromCharCode(...bytes).trim();

        if (a.validate(str)) {
            return new a(str) as InstanceType<Address>;
        }

        // io.write(new Uint8Array([10]))
        ioclearline(io);
    }

    return undefined;
}
async function dhcp_server_conf_read_ipv4address(io: DeviceIO, message = "enter address: "): Promise<undefined | IPV4Address> {
    return dhcp_server_conf_read_address(io, message, IPV4Address);
}
async function dhcp_server_conf_read_macaddress(io: DeviceIO, message = "enter address: "): Promise<undefined | MACAddress> {
    return dhcp_server_conf_read_address(io, message, MACAddress);
}

function dhcp_server_man_print_config(io: DeviceIO, ifid: string, config: DHCPServerConfig) {
    let table: (string | undefined)[][] = [[ifid + ":"]];

    table.push(["server_id4", `${config.server_id4.toString()}/${config.netmask4.length}`])

    let clients = Object.values(config.clients).filter(Boolean);
    let bound_clients = clients.reduce((sum, c) => {
        if ((c?.state == DHCPServerClientState.BOUND)) return sum + 1;
        return sum;
    }, 0);

    if (config.address_range4) {
        table.push(["address_range4", `${config.address_range4[0]}-${config.address_range4[1]}`]);
    }

    if (config.gateways4) {
        for (let ga of config.gateways4) {
            table.push(["gateway4", ga.toString()]);
        }
    }

    if (clients.length > 0) {
        table.push(["bound clients", bound_clients.toString()])
        table.push(["known clients", `${clients.length}`])
        // table.push(["known clients", `${clients.length} (${((bound_clients / clients.length) * 100).toFixed(0)}%)`])
    }
    io.write(formatTable(table));
}

const DEVICE_PROGRAM_DHCP_SERVER_MAN_MCONF: Program = {
    name: "mconf",
    description: "edit dhcp server configurations using menus",
    content: "<dhcpsman mconf [ifid]>",
    init(proc, args) {
        let [, , ifid, initial_op] = args;

        if (!ifid) {
            ioprintln(proc.io, "ifid: missing");
            return ProcessSignal.ERROR;
        }

        let iface = proc.device.interfaces.find((iface) => iface.id() == ifid);
        if (!iface) {
            ioprintln(proc.io, "ifid: interface id is invalid")
            return ProcessSignal.ERROR;
        }

        let res = dhcp_server_iface_init(proc.device, iface);
        if (!res.success) {
            ioprintln(proc.io, res.message!)
            return ProcessSignal.ERROR;
        }

        let config = res.data;

        return run_menu(proc, {
            [0]: {
                description: "exit",
                async cb(proc) {
                    dhcp_server_man_print_config(proc.io, iface.id(), config);
                    ioprintln(proc.io, "Bye!");
                    proc.close();
                }
            },
            [1]: {
                description: "set gateway4",
                async cb(proc) {
                    ioprintln(proc.io, this.description);
                    ioprintln(proc.io, `server_id: ${config.server_id4.toString()}/${config.netmask4.length}`)

                    let addr = await dhcp_server_conf_read_ipv4address(proc.io, "Enter gateway: ")
                    proc.io.write(new Uint8Array([10]))

                    if (!addr) {
                        ioprintln(proc.io, "invalid input")
                    } else {
                        let res = dhcp_server_gateways4_set(proc.device, iface, addr)

                        if (!res.success && res.message) {
                            ioprintln(proc.io, res.message);
                        } else {
                            ioprintln(proc.io, "the following gateway was set: " + addr);
                        }
                    }

                    ioprint(proc.io, "press enter to return to menu ...")
                    await ioreadline(proc.io);
                },
            },
            [2]: {
                description: "set address range4",
                async cb(proc) {
                    // fun thing compute a possible range
                    // like for 192.168.1.23/24 -> 192.168.1.X-192.168.1.X
                    ioprintln(proc.io, this.description);
                    ioprintln(proc.io, `server_id: ${config.server_id4.toString()}/${config.netmask4.length}`)

                    let start = await dhcp_server_conf_read_ipv4address(proc.io, "Enter start: ")
                    if (!start) {
                        ioprintln(proc.io, "invalid input")
                        ioprint(proc.io, "press enter to return to menu ...")
                        await ioreadline(proc.io);
                        return;
                    }

                    proc.io.write(new Uint8Array([10]))

                    let end = await dhcp_server_conf_read_ipv4address(proc.io, "Enter end:  ")
                    if (!end) {
                        ioprintln(proc.io, "invalid input")
                        ioprint(proc.io, "press enter to return to menu ...")
                        await ioreadline(proc.io);
                        return;
                    }

                    proc.io.write(new Uint8Array([10]))

                    let res = dhcp_server_range4_add(proc.device, iface, start, end);
                    if (!res.success && res.message) {
                        ioprintln(proc.io, res.message)
                    } else {
                        ioprintln(proc.io, "the following address range was set:\n" + start.toString() + "-" + end.toString());
                    }

                    ioprint(proc.io, "press enter to return to menu ...")
                    await ioreadline(proc.io);
                }
            },
            [3]: {
                description: "clients exist",
                async cb(proc) {
                    // !TODO: list clients
                    /*
                        i.e. a new menu
                        (n) (formatted clid) (client ip conf) (state)
                        (1) fa-ff-0f-00-00-86 10.20.0.20/24 BOUND
                    */

                    let clients = Object.entries(config.clients).filter(v => v[1]) as [string, DHCPServerClient][];


                    let id_start = 200;

                    let fields: MenuFields = {
                        [0]: {
                            description: "exit",
                            async cb(proc, resolve) {
                                resolve();
                            }
                        },
                        [1]: {
                            description: "add client",
                            async cb(proc) {
                                ioprintln(proc.io, this.description);
                                ioprintln(proc.io, `server_id: ${config.server_id4.toString()}/${config.netmask4.length}`)

                                let mac = await dhcp_server_conf_read_macaddress(proc.io, "Enter client Mac: ")
                                if (!mac) {
                                    ioprintln(proc.io, "invalid input")
                                    ioprint(proc.io, "press enter to return to menu ...")
                                    await ioreadline(proc.io);
                                    return;
                                }
                                proc.io.write(new Uint8Array([10]))
                                let clid = dhcp_server_serialize_clid(uint8_concat([new Uint8Array([0x1]), mac.buffer]));
                                if (config.clients[clid]) {
                                    ioprintln(proc.io, "client already exists\n")
                                    ioprint(proc.io, "press enter to return to menu ...")
                                    await ioreadline(proc.io);
                                    return;
                                }

                                let address = await dhcp_server_conf_read_ipv4address(proc.io, "Enter address4: ");
                                if (!address) {
                                    ioprintln(proc.io, "invalid input")
                                    ioprint(proc.io, "press enter to return to menu ...")
                                    await ioreadline(proc.io);
                                    return;
                                }
                                proc.io.write(new Uint8Array([10]))

                                let res = dhcp_server_client_init(proc.device, iface, clid, address);
                                if (!res.success && res.message) {
                                    ioprintln(proc.io, res.message)

                                    ioprint(proc.io, "press enter to return to menu ...")
                                    await ioreadline(proc.io);
                                }

                                let client = config.clients[clid]!;
                                fields[id_start] = {
                                    description: `modify: ${clid} - ${client.address4}/${client.netmask4!.length}`,
                                    cb: bind_cb(id_start++, clid, client),
                                }
                            }
                        },
                    };

                    function bind_cb(idx: number, clid: string, client: DHCPServerClient) {
                        return async function (proc: Process) {
                            await run_menu(proc, {
                                [0]: {
                                    description: "exit",
                                    async cb(proc, resolve) {
                                        resolve()
                                    },
                                },
                                [100]: {
                                    description: "delete client",
                                    async cb(proc, resolve) {
                                        dhcp_server_client_delete(proc.device, iface!, clid)
                                        delete fields[idx]
                                        resolve()
                                    },
                                }
                            })
                            return;
                        }
                    }

                    for (let [clid, client] of clients) {
                        fields[id_start] = {
                            description: `modify: ${clid} - ${client.address4}/${client.netmask4!.length}`,
                            cb: bind_cb(id_start, clid, client),
                        }
                        id_start++;
                    }

                    await run_menu(proc, fields);
                }
            },
            [100]: {
                description: "delete configuration",
                async cb(proc) {
                    dhcp_server_iface_delete(proc.device, iface);
                    proc.close();
                }
            }
        }, parseInt(initial_op))
    },
    __NODATA__: true
}

const DEVICE_PROGRAM_DHCP_SERVER_MAN_CONF: Program = {
    name: "conf",
    description: "edit dhcp server configurations",
    content: `<dhcpsman conf [ifid] ...>
<dhcpsman conf [ifid] delete> -- delete a configuration
<dhcpsman conf [ifid] gateway4 (add | remove) [...address]> -- add or remove configured gateways
<dhcpsman conf [ifid] range4 add start end> -- set an address range
<dhcpsman conf [ifid] client delete [client id]> -- delete a client
<dhcpsman conf [ifid] client init4 [client id] [address]> -- initialize a client with an address`,
    init(proc, args) {
        let [, , ifid, ...ops] = args;

        if (!ifid) {
            ioprintln(proc.io, "ifid: missing");
            return ProcessSignal.ERROR;
        }

        let iface = proc.device.interfaces.find((iface) => iface.id() == ifid);
        if (!iface) {
            ioprintln(proc.io, "ifid: interface id is invalid")
            return ProcessSignal.ERROR;
        }

        let res = dhcp_server_iface_init(proc.device, iface);
        if (!res.success) {
            ioprintln(proc.io, res.message!)
            return ProcessSignal.ERROR;
        }

        let config = res.data;

        if (ops.length == 0) {
            dhcp_server_man_print_config(proc.io, iface.id(), config)
            return ProcessSignal.EXIT;
        }


        let op = ops.shift();
        if (op === "delete") {
            dhcp_server_iface_delete(proc.device, iface);
            ioprintln(proc.io, "configuration deleted");
            return ProcessSignal.EXIT;
        }

        if (op === "gateway4") {
            if (ops.length == 0) {
                ioprintln(proc.io, "action missing");
                return ProcessSignal.ERROR;
            }

            let action = ops.shift();

            if (action == "add") {
                let gateways: IPV4Address[] = [];
                for (let pa of ops) {
                    if (!IPV4Address.validate(pa)) {
                        gateways.push(new IPV4Address(pa))
                    }
                }

                let fail_msg = "failed to add gateway"
                if (gateways.length == 0) {
                    ioprintln(proc.io, fail_msg)
                    return ProcessSignal.ERROR;
                }

                let res = dhcp_server_gateways4_set(proc.device, iface, ...gateways);
                if (!res.success) {
                    ioprintln(proc.io, res.message || fail_msg)
                    return ProcessSignal.ERROR;
                }

                ioprintln(proc.io, `success: the following gateways are set ${res.data.gateways4!.join(", ")}`);
            } else if (action == "remove") {
                // !TODO: add removal of gateways
                ioprintln(proc.io, "removing not supported")
                return ProcessSignal.ERROR;
            } else {
                ioprintln(proc.io, "unknown action");
                return ProcessSignal.ERROR;
            }
        } else if (op == "range4") {
            if (ops.length == 0) {
                ioprintln(proc.io, "action missing");
                return ProcessSignal.ERROR;
            }

            let action = ops.shift();

            if (action != "add") {
                ioprintln(proc.io, "unknown action");
                return ProcessSignal.ERROR;
            }

            if (ops.length < 2) {
                ioprintln(proc.io, "a range requires a start and end addresses")
                return ProcessSignal.ERROR;
            }

            let addresses: IPV4Address[] = [];
            for (let pa of ops) {
                if (!IPV4Address.validate(pa)) {
                    ioprintln(proc.io, "invalid input: " + pa);
                    return ProcessSignal.ERROR;
                }

                addresses.push(new IPV4Address(pa));
            }

            let res = dhcp_server_range4_add(proc.device, iface, addresses[0], addresses[1]);
            if (!res.success) {
                ioprintln(proc.io, res.message || "invalid input: " + ops.join(" "))
                return ProcessSignal.ERROR;
            }

            ioprintln(proc.io, `success: the following range is set ${res.data.address_range4!.join("-")}`);
        } else if (op == "client") {
            if (ops.length == 0) {
                ioprintln(proc.io, "action missing");
                return ProcessSignal.ERROR;
            }

            let action = ops.shift();

            let clid = ops.shift();

            if (!clid) {
                ioprintln(proc.io, "client id missing");
                return ProcessSignal.ERROR;
            }

            if (action == "delete") {
                let res = dhcp_server_client_delete(proc.device, iface, clid); // ignore result
                ioprintln(proc.io, "client deleted");
            } else if (action == "init4") {
                let pa = ops.shift();
                if (!IPV4Address.validate(pa)) {
                    ioprintln(proc.io, "address missing or invalid")
                    return ProcessSignal.ERROR;
                }

                let res = dhcp_server_client_init(proc.device, iface, clid, new IPV4Address(pa!));
                if (!res.success) {
                    ioprintln(proc.io, res.message || "failed to initialize client")
                    return ProcessSignal.ERROR;
                }

                ioprintln(proc.io, `success: the following client was initialized ${clid}`);
            }
        }

        return ProcessSignal.EXIT;
    }
}

export const DEVICE_PROGRAM_DHCP_SERVER_MAN: Program = {
    name: "dhcpsman",
    description: "manage the status of the dhcp-server daemon",
    content: `<dhcpsman (start | stop)>`,
    init(proc: Process, args) {
        let [, action] = args
        let data = dhcp_server_get_store_data(proc.device);

        if (action === "start") {
            if (!data.configs) {
                ioprintln(proc.io, "please initialize an interface")
                return ProcessSignal.ERROR;
            }
            proc.device.process_start(DAEMON_DHCP_SERVER);
        }

        let routingd = proc.device.processes.items.find(p => p?.id.includes(DAEMON_DHCP_SERVER.name) && proc != p)

        if (routingd && action == "stop") {
            routingd.close(ProcessSignal.INTERRUPT);
            routingd = undefined;
        }

        ioprintln(proc.io, "Status: " + (routingd ? "started" : "stopped"))

        // format the config data
        if (data.configs) {
            proc.io.write(new Uint8Array([10]))

            for (let [ifid, config] of Object.entries(data.configs)) {
                if (!config) continue;
                dhcp_server_man_print_config(proc.io, ifid, config);
            }
        }

        return ProcessSignal.EXIT;
    },
    __NODATA__: true,
    sub: [DEVICE_PROGRAM_DHCP_SERVER_MAN_CONF, DEVICE_PROGRAM_DHCP_SERVER_MAN_MCONF]
}