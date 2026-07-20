import { ResourceState } from "../types";
export declare abstract class BaseProvider {
    abstract name: string;
    abstract supportedTypes: string[];
    abstract create(resourceName: string, attributes: Record<string, any>): Promise<ResourceState>;
    abstract read(id: string): Promise<ResourceState | null>;
    abstract update(id: string, resourceName: string, attributes: Record<string, any>, resourceType?: string): Promise<ResourceState>;
    abstract delete(id: string, attributes?: Record<string, any>): Promise<void>;
    abstract exists(id: string): Promise<boolean>;
    protected generateId(prefix: string): string;
}
//# sourceMappingURL=base.d.ts.map