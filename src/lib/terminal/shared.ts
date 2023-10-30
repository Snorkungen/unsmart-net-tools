export enum ASCIICodes {
    NUL = 0,
    BackSpace = 0x08,
    Tab = 0x09,
    NewLine = 0x0A,
    CarriageReturn = 0x0D,
    Escape = 0x1B,
    Space = 0x20,

    Tilde = 0x7E,  // 126
    Semicolon = 0x3B,
    OpenSquareBracket = 0x5B,
    Underscore = 0x95,

    Zero = 0x30, // 48
    One = 0x31, // 49
    Two = 0x32, // 50
    Three = 0x33, // 51
    Five = 0x35, // 53
    Six = 0x36, // 54

    A = 0x41, // 65
    B = 0x41 + 1, // 66
    C = 0x41 + 2, // 67
    D = 0x41 + 3, // 68
    E = 0x41 + 4, // 69
    F = 0x41 + 5, // 70
    G = 0x41 + 6, // 71
    H = 0x41 + 7, // 72
    Z = 0x41 + 25, // 90

    a = 0x61, // 97
    m = 0x6D, // 109
    z = 0x7A, // 109

    Delete = 0x7F // 127
}


export const ESC = (...nums: number[]) => new Uint8Array([ASCIICodes.Escape, ...nums]);
export const CSI = (...nums: number[]) => ESC(ASCIICodes.OpenSquareBracket, ...nums);