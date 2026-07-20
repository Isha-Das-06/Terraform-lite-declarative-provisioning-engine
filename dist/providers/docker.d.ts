import { BaseProvider } from "./base";
import { ResourceState } from "../types";
export declare class DockerProvider extends BaseProvider {
    name: string;
    supportedTypes: string[];
    create(resourceName: string, attributes: Record<string, any>): Promise<ResourceState>;
    private createImage;
    private createContainer;
    private createNetwork;
    read(id: string): Promise<ResourceState | null>;
    update(id: string, resourceName: string, attributes: Record<string, any>, resourceType?: string): Promise<ResourceState>;
    delete(id: string, attributes?: Record<string, any>): Promise<void>;
    exists(id: string): Promise<boolean>;
}
//# sourceMappingURL=docker.d.ts.map