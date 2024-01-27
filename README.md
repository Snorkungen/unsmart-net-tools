# Unsmart Net-Tools

## Tasks

- Develop on device logic
  - [ ] Overhaul Device
    - [x] Make the DeviceInterface an actual interface
    - [x] Make device able to send ipv4 data
    - [x] Make device able to send ipv6 data
    - [ ] Integrate Device2 into Contact "Infrastructure"
  - [ ] Device -> contact
    - [x] UDP protocol support
    - [ ] TCP protocol support
- [ ] Terminal & Shell
  - [ ] *Auto resize `TerminaleRenderer` View* haven't decided on what this means
  - [ ] Feature parity with previous "tty"
    - [ ] Tab completion
    - [ ] Intercept keystrokes, For `DPSignal` Purposes
    - [x] Implement features of previous "programs"
  - [ ] Enviroment Variables & Variable expansion `Shell.promptBuffer`
- [x] Remove `Buffer` from client build
  - [x] Remove `buffer` polyfill
  - [x] remove dependence on `Buffer` from lib/address
  - [x] lib/binary/struct remove all references of `Buffer`
  - [x] Remove uses of `Buffer` from lib/binary/*
  - [x] Remove uses of `Buffer` from lib/header/*
  - [x] Remove uses of `Buffer` from lib/packet-capture/*
  - [x] Remove references to `Buffer` from lib/device/*
- [ ] Logically separate the code
  - [x] Seperate Address class from struct-type
