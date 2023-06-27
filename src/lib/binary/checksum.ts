/**
 * 
 * Code taken from **stackoverflow** <https://stackoverflow.com/a/4114507>
 * 
 * Calculate the Internet Checksum of a buffer (RFC 1071 - http://www.faqs.org/rfcs/rfc1071.html)
 * Algorithm is
 * 1) apply a 16-bit 1's complement sum over all octets (adjacent 8-bit pairs [A,B], final odd length is [A,0])
 * 2) apply 1's complement to this final sum
 *
 * Notes:
 * 1's complement is bitwise NOT of positive value.
 * Ensure that any carry bits are added back to avoid off-by-one errors
 *
 *
 * @param buf The message
 * @return The checksum
 */
export function calculateChecksum(buf: Uint8Array): number {
    let i = 0, length = buf.length,
        sum = 0,
        data: number;

    // Handle all pairs
    while (length > 1) {
        // Corrected to include @Andy's edits and various comments on Stack Overflow
        data = (((buf[i] << 8) & 0xff00) | ((buf[i + 1]) & 0xff));
        sum += data;

        // 1's complement carry bit correction in 16-bits (detecting sign extension)
        if ((sum & 0xffff0000) > 0) {
            sum = sum & 0xffff;
            sum += 1;
        }

        i += 2;
        length -= 2;
    }

    // Handle remaining byte in odd length buffers
    if (length > 0) {
        // Corrected to include @Andy's edits and various comments on Stack Overflow
        sum += (buf[i] << 8 & 0xff00);
        // 1's complement carry bit correction in 16-bits (detecting sign extension)
        if ((sum & 0xffff0000) > 0) {
            sum = sum & 0xffff;
            sum += 1;
        }
    }

    // Final 1's complement value correction to 16-bits
    sum = ~sum;
    sum = sum & 0xFFFF;
    return sum;

}