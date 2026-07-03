import { BaseProvider } from "./base";
import { ResourceState } from "../types";
export declare class FilesystemProvider extends BaseProvider {
    name: string;
    supportedTypes: string[];
    create(resourceName: string, attributes: Record<string, any>): Promise<ResourceState>;
    private createFile;
    private createDirectory;
    private createTemplate;
    read(id: string): Promise<ResourceState | null>;
    update(id: string, resourceName: string, attributes: Record<string, any>, resourceType?: string): Promise<ResourceState>;
    private updateFile;
    private updateDirectory;
    delete(id: string, attributes?: Record<string, any>): Promise<void>;
    exists(id: string): Promise<boolean>;
    private hashContent;
}
//# sourceMappingURL=filesystem.d.ts.map