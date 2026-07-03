import { Config, Resource } from "../types";
export declare class ConfigParser {
    private config;
    private variables;
    loadConfig(filePath: string): Config;
    private processVariables;
    getResources(): Resource[];
    private interpolateAttributes;
    getConfig(): Config;
    getVariables(): Record<string, any>;
    setVariable(name: string, value: any): void;
}
//# sourceMappingURL=parser.d.ts.map