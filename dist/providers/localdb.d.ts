import { BaseProvider } from "./base";
import { ResourceState } from "../types";
export declare class LocalDBProvider extends BaseProvider {
    name: string;
    supportedTypes: string[];
    private databases;
    private dbPaths;
    create(resourceName: string, attributes: Record<string, any>): Promise<ResourceState>;
    private createDatabase;
    private createTable;
    private buildColumnDefinitions;
    read(id: string): Promise<ResourceState | null>;
    update(id: string, resourceName: string, attributes: Record<string, any>, resourceType?: string): Promise<ResourceState>;
    delete(id: string, attributes?: Record<string, any>): Promise<void>;
    exists(id: string): Promise<boolean>;
}
//# sourceMappingURL=localdb.d.ts.map