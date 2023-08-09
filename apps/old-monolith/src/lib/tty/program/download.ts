import { TTYProgram, TTYProgramStatus, createTTYProgram, parseArgs } from "./program";

const PCAP_FILE_EXTENSION = ".cap"

export const ttyProgramDownload: TTYProgram = createTTYProgram((writer, device) => ({
    cancel() { },
    run(args) {
        return new Promise(resolve => {
            this.cancel = () => { resolve(TTYProgramStatus.CANCELED) };

            let [, name] = parseArgs(args);

            if (name && name.substring(name.length - PCAP_FILE_EXTENSION.length) != PCAP_FILE_EXTENSION) {
                name += PCAP_FILE_EXTENSION
            }

            let file = device.createCaptureFile(name);

            if (!file) {
                writer.write("Nothing to download.");
                return resolve(TTYProgramStatus.ERROR);
            }

            writer.write(`Downloading: ${file.name}`)
            
            let anchor = document.createElement("a");
            anchor.href = URL.createObjectURL(file);
            anchor.download = file.name;

            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove()

            resolve(TTYProgramStatus.OK)
        })
    }
}), {
    about: {
        description: "Download a packet capture from device.",
        content: `
                <download>
                <download [name]>
                `
    },
})