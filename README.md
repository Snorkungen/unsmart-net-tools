# Unsmart Net-Tools

## Tasks

- Develop on device logic
  - [ ] add teardown method for `BaseInterface`
  - [x] Overhaul Device
    - [x] Integrate Device2 into Contact "Infrastructure"
    - [x] flesh out the functionality
      - [x] output_ip check that the destination is not source then loopback etc.
      - [x] input_ip verify that daddr is for the device
    - [x] migrate all previous programs and services to Device2 system
    - [x] implement vlan aware switch
    - [x] implement router & vlanif logic
    - [x] move views to exlusively use Device2
  - [ ] Device -> contact
    - [x] UDP protocol support
    - [ ] TCP protocol support
- [ ] Terminal & Shell
  - [ ] batch rendering for more effecient rendering
  - [ ] *Auto resize `TerminaleRenderer` View* haven't decided on what this means
  - [ ] Feature parity with previous "tty"
    - [ ] Tab completion
  - [ ] Enviroment Variables & Variable expansion `Shell.promptBuffer`
- [x] Remove `Buffer` from client build
- [ ] Logically separate the code
  - [x] Seperate Address class from struct-type

![a picture of the view network-map.tsx](./src/assets/Screenshot_20240209_124926.png)