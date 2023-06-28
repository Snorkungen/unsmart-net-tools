const fs = require("fs");

let [, , filename, rawData, encoding] = process.argv;

const fd = fs.openSync(filename, "w");

let buf = Buffer.from(rawData, encoding ?? "base64");
fs.writeSync(fd, buf, 0, buf.length)
fs.closeSync(fd);

