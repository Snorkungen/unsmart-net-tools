# Unsmart Net-Tools

## Tasks

- Develop on device logic
  - [ ] Overhaul Device
    - [ ] add teardown method for `BaseInterface`
    - [x] Integrate Device2 into Contact "Infrastructure"
    - [ ] flesh out the functionality
      - [ ] output_ip check that the destination is not source then loopback etc.
      - [ ] input_ip verify that daddr is for the device
    - [x] create Process system
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
