import { Resource, Config } from "../types";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function validateResource(resource: Resource): void {
  if (!resource.type) {
    throw new ValidationError(`Resource must have 'type' field`);
  }
  if (!resource.name) {
    throw new ValidationError(`Resource must have 'name' field`);
  }
  if (!resource.attributes || typeof resource.attributes !== "object") {
    throw new ValidationError(
      `Resource attributes must be an object for ${resource.type}.${resource.name}`
    );
  }
  if (resource.depends_on && !Array.isArray(resource.depends_on)) {
    throw new ValidationError(
      `depends_on must be an array for ${resource.type}.${resource.name}`
    );
  }
}

export function validateConfig(config: Config): void {
  if (!config || typeof config !== "object") {
    throw new ValidationError("Config must be an object");
  }

  if (config.resource) {
    for (const [typeKey, typeValue] of Object.entries(config.resource)) {
      if (typeof typeValue !== "object") {
        throw new ValidationError(
          `Resource type '${typeKey}' must contain resource definitions`
        );
      }
      for (const [nameKey, resourceDef] of Object.entries(typeValue)) {
        if (typeof resourceDef !== "object") {
          throw new ValidationError(
            `Resource '${typeKey}.${nameKey}' must be an object`
          );
        }
        const resource: Resource = {
          type: typeKey,
          name: nameKey,
          attributes: resourceDef as Record<string, any>,
          depends_on: (resourceDef as any).depends_on,
        };
        validateResource(resource);
      }
    }
  }
}

export function parseResourceRef(ref: string): { type: string; name: string } {
  const parts = ref.split(".");
  if (parts.length !== 2) {
    throw new ValidationError(
      `Invalid resource reference: ${ref}. Use format: type.name`
    );
  }
  return { type: parts[0], name: parts[1] };
}

export function interpolateVariables(
  value: any,
  variables: Record<string, any>
): any {
  if (typeof value === "string") {
    return value.replace(/\$\{var\.(\w+)\}/g, (match, varName) => {
      if (!(varName in variables)) {
        throw new ValidationError(`Undefined variable: ${varName}`);
      }
      return String(variables[varName]);
    });
  }
  if (Array.isArray(value)) {
    return value.map((item) => interpolateVariables(item, variables));
  }
  if (typeof value === "object" && value !== null) {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = interpolateVariables(val, variables);
    }
    return result;
  }
  return value;
}
