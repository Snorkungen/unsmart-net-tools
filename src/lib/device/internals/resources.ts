
export interface DeviceResource {
    abort_controller: AbortController;
    close(): void;
}

export class DeviceResources<T extends DeviceResource = DeviceResource> {
    resources: (undefined | T)[] = [];

    create(resource: T): T {
        let i = -1; while (this.resources[++i]) { continue; }
        resource.abort_controller.signal.addEventListener("abort", () => {
            delete this.resources[i];
        }, { once: true });
        this.resources[i] = resource;

        return resource;
    }
    close() {
        for (let resource of this.resources) {
            if (resource) {
                resource.close();
            }
        }
        this.resources.length = 0;
    }
}