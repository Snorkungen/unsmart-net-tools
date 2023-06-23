import { Struct, StructType } from "."

export function defineStruct<Types extends Record<string, StructType<any>>>(input: Types) {
    return new Struct<Types>(input)
}

export function defineStructType<T extends any>(input: StructType<T>) {
    return Object.assign((bitLength: number) => {

        if (input.bitLength < bitLength) {
            throw new Error(`cannot define, bitLength "${bitLength}" is larger than type size "${input.bitLength}".`)
        }

        let structType = <StructType<T>>{ ...input, bitLength }

        // i don't know if this is optimal
        return defineStructType<T>(structType);
        return structType;
    }, input)
}