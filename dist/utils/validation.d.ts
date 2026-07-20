import { Resource, Config } from "../types";
export declare class ValidationError extends Error {
    constructor(message: string);
}
export declare function validateResource(resource: Resource): void;
export declare function validateConfig(config: Config): void;
export declare function parseResourceRef(ref: string): {
    type: string;
    name: string;
};
export declare function interpolateVariables(value: any, variables: Record<string, any>): any;
//# sourceMappingURL=validation.d.ts.map