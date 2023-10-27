# Unsmart Net-Tools

## Tasks

- Develop on device logic
  - [ ] Device -> contact
    - Design the api
    - [ ] UDP protocol support
      - [x] Send packet
      - [x] Recieve packet
    - [ ] TCP protocol support
- [ ] Redo "Terminal Emulator" design
- [x] Remove `Buffer` from client build
  - [x] Remove `buffer` polyfill
  - [x] remove dependence on `Buffer` from lib/address
    - [x] AddressBase `buffer` value from `Buffer` instance to something else
    > I'm not certain but i think that `buffer` value should be an instance of `Uint8Array`
    - [x] Move to have internal Address Methods treat buffer as an `Uint8Array`
  - [x] lib/binary/struct remove all references of `Buffer`
    - [x] lib/binary/struct/value-types.ts internal to not use `Buffer` instance methods
    - [x] `StructType` remove dependence of `Buffer`
    - [x] All references of `Struct.getBuffer()` should treat value as `Uint8Array`.
    - [x] `Struct`: remove dependence on `Buffer`
  - [x] Remove uses of `Buffer` from lib/binary/*
  - [x] Remove uses of `Buffer` from lib/header/*
  - [x] Remove uses of `Buffer` from lib/packet-capture/*
  - [x] Remove references to `Buffer` from lib/device/*
- [ ] Logically separate the code
  - [x] Seperate Address class from struct-type
