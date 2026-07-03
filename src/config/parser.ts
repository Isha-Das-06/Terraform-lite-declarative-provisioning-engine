import * as fs from "fs";
import * as path from "path";
import { Config, Resource } from "../types";
import { validateConfig, interpolateVariables } from "../utils/validation";
import { logger } from "../utils/logger";

export class ConfigParser {
  private config: Config = {};
  private variables: Record<string, any> = {};

  loadConfig(filePath: string): Config {
    logger.debug(`Loading config from ${filePath}`);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Config file not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const config = JSON.parse(content);

    validateConfig(config);
    this.config = config;

    this.processVariables();

    return config;
  }

  private processVariables(): void {
    const variables = this.config.variable || {};

    for (const [name, varDef] of Object.entries(variables)) {
      if (varDef.default !== undefined) {
        this.variables[name] = varDef.default;
      }
    }

    logger.debug("Variables loaded", Object.keys(this.variables));
  }

  getResources(): Resource[] {
    const resources: Resource[] = [];

    if (!this.config.resource) {
      return resources;
    }

    for (const [type, typeResources] of Object.entries(this.config.resource)) {
      for (const [name, attributes] of Object.entries(typeResources)) {
        const resource: Resource = {
          type,
          name,
          attributes: this.interpolateAttributes(attributes as Record<string, any>),
          depends_on: (attributes as any).depends_on,
        };
        resources.push(resource);
      }
    }

    return resources;
  }

  private interpolateAttributes(
    attributes: Record<string, any>
  ): Record<string, any> {
    const attrs = { ...attributes };
    delete attrs.depends_on;

    return interpolateVariables(attrs, this.variables);
  }

  getConfig(): Config {
    return this.config;
  }

  getVariables(): Record<string, any> {
    return { ...this.variables };
  }

  setVariable(name: string, value: any): void {
    this.variables[name] = value;
  }
}
