
export interface DeviceResource {
    abort_controller: AbortController;
    close(): void;
}

export class DeviceResources<T extends DeviceResource = DeviceResource> {
    items: (undefined | T)[] = [];

    create<CT extends T>(resource: CT): CT {
        let i = -1; while (this.items[++i]) { continue; }
        resource.abort_controller.signal.addEventListener("abort", () => {
            delete this.items[i];
        }, { once: true });
        this.items[i] = resource;

        return resource;
    }
    close() {
        for (let resource of this.items) {
            if (resource) {
                resource.close();
            }
        }
        this.items.length = 0;
    }
}