import { ResourceState } from "../types";

export abstract class BaseProvider {
  abstract name: string;
  abstract supportedTypes: string[];

  abstract create(
    resourceName: string,
    attributes: Record<string, any>
  ): Promise<ResourceState>;

  abstract read(id: string): Promise<ResourceState | null>;

  abstract update(
    id: string,
    resourceName: string,
    attributes: Record<string, any>,
    resourceType?: string
  ): Promise<ResourceState>;

  abstract delete(id: string, attributes?: Record<string, any>): Promise<void>;

  abstract exists(id: string): Promise<boolean>;

  protected generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
