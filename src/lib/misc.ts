export const getKeyByValue = <N extends number, T extends Record<string, N>>(obj: T, value: N): keyof T => Object.keys(obj).find(key => obj[key] === value) ?? "";
