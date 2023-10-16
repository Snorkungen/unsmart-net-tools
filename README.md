# Unsmart Net-Tools

## Tasks

- [ ] Logically separate the code & remove usage of `Buffer`
  - [x] Seperate Address class from struct-type
  - [x] remove dependence on `Buffer` from lib/address
    - [x] AddressBase `buffer` value from `Buffer` instance to something else
    > I'm not certain but i think that `buffer` value should be an instance of `Uint8Array`
    - [x] Move to have internal Address Methods treat buffer as an `Uint8Array`
  - [ ] lib/binary/struct remove all references of `Buffer`
    - [x] lib/struct/value-types.ts internal to not use `Buffer` instance methods
    - [x] `StructType` remove dependence of `Buffer`
    - [x] All references of `Struct.getBuffer()` should treat value as `Uint8Array`.
    - [ ] `Struct`: remove dependence on `Buffer`
