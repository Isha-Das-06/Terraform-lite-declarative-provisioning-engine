"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationError = void 0;
exports.validateResource = validateResource;
exports.validateConfig = validateConfig;
exports.parseResourceRef = parseResourceRef;
exports.interpolateVariables = interpolateVariables;
class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "ValidationError";
    }
}
exports.ValidationError = ValidationError;
function validateResource(resource) {
    if (!resource.type) {
        throw new ValidationError(`Resource must have 'type' field`);
    }
    if (!resource.name) {
        throw new ValidationError(`Resource must have 'name' field`);
    }
    if (!resource.attributes || typeof resource.attributes !== "object") {
        throw new ValidationError(`Resource attributes must be an object for ${resource.type}.${resource.name}`);
    }
    if (resource.depends_on && !Array.isArray(resource.depends_on)) {
        throw new ValidationError(`depends_on must be an array for ${resource.type}.${resource.name}`);
    }
}
function validateConfig(config) {
    if (!config || typeof config !== "object") {
        throw new ValidationError("Config must be an object");
    }
    if (config.resource) {
        for (const [typeKey, typeValue] of Object.entries(config.resource)) {
            if (typeof typeValue !== "object") {
                throw new ValidationError(`Resource type '${typeKey}' must contain resource definitions`);
            }
            for (const [nameKey, resourceDef] of Object.entries(typeValue)) {
                if (typeof resourceDef !== "object") {
                    throw new ValidationError(`Resource '${typeKey}.${nameKey}' must be an object`);
                }
                const resource = {
                    type: typeKey,
                    name: nameKey,
                    attributes: resourceDef,
                    depends_on: resourceDef.depends_on,
                };
                validateResource(resource);
            }
        }
    }
}
function parseResourceRef(ref) {
    const parts = ref.split(".");
    if (parts.length !== 2) {
        throw new ValidationError(`Invalid resource reference: ${ref}. Use format: type.name`);
    }
    return { type: parts[0], name: parts[1] };
}
function interpolateVariables(value, variables) {
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
        const result = {};
        for (const [key, val] of Object.entries(value)) {
            result[key] = interpolateVariables(val, variables);
        }
        return result;
    }
    return value;
}
//# sourceMappingURL=validation.js.map