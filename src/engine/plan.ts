import { Resource, State, Plan, ResourceDiff, DiffOperation } from "../types";
import { StateManager } from "../state/manager";
import { logger } from "../utils/logger";
import * as crypto from "crypto";

export class PlanEngine {
  constructor(private stateManager: StateManager) {}

  generatePlan(resources: Resource[], currentState: State): Plan {
    const changes: ResourceDiff[] = [];
    const now = Date.now();

    const stateMap = new Map(
      currentState.resources.map((r) => [`${r.type}.${r.name}`, r])
    );

    // Check for creates and updates
    for (const resource of resources) {
      const resourceKey = `${resource.type}.${resource.name}`;
      const existingState = stateMap.get(resourceKey);

      if (!existingState) {
        // Create operation
        changes.push({
          operation: "create",
          type: resource.type,
          name: resource.name,
          new_attributes: resource.attributes,
        });
      } else {
        // Normalize desired attributes to match provider storage format
        const normalizedDesired = this.normalizeDesiredAttributes(
          resource.attributes
        );
        // Extract only attributes from state that are in the normalized desired config
        const relevantStateAttrs = this.extractRelevantAttributes(
          existingState.attributes,
          normalizedDesired
        );
        if (this.attributesDiffer(relevantStateAttrs, normalizedDesired)) {
          changes.push({
            operation: "update",
            type: resource.type,
            name: resource.name,
            id: existingState.id,
            old_attributes: existingState.attributes,
            new_attributes: resource.attributes,
          });
        } else {
          changes.push({
            operation: "no-op",
            type: resource.type,
            name: resource.name,
            id: existingState.id,
            new_attributes: resource.attributes,
          });
        }
      }
    }

    // Check for deletes (resources in state but not in config)
    const configResources = new Set(
      resources.map((r) => `${r.type}.${r.name}`)
    );

    for (const [resourceKey, resource] of stateMap) {
      if (!configResources.has(resourceKey)) {
        changes.push({
          operation: "delete",
          type: resource.type,
          name: resource.name,
          id: resource.id,
          old_attributes: resource.attributes,
        });
      }
    }

    const plan: Plan = {
      serial: currentState.serial + 1,
      changes,
      resource_count: {
        create: changes.filter((c) => c.operation === "create").length,
        update: changes.filter((c) => c.operation === "update").length,
        delete: changes.filter((c) => c.operation === "delete").length,
      },
      timestamp: now,
    };

    logger.debug(
      `Plan generated: +${plan.resource_count.create} ~${plan.resource_count.update} -${plan.resource_count.delete}`
    );

    return plan;
  }

  private normalizeDesiredAttributes(
    attrs: Record<string, any>
  ): Record<string, any> {
    const normalized = { ...attrs };

    // Hash content field if present (providers store content_hash, not raw content)
    if ("content" in normalized && typeof normalized.content === "string") {
      const fullHash = crypto.createHash("sha256").update(normalized.content).digest("hex");
      // Match provider's behavior: take only first 8 characters of hash
      normalized.content_hash = fullHash.substring(0, 8);
      delete normalized.content;
    }

    // For templates: hash the rendered content (template + variables interpolated)
    if ("template" in normalized && "variables" in normalized) {
      let renderedContent = normalized.template;
      const vars = normalized.variables || {};
      for (const [key, value] of Object.entries(vars)) {
        const placeholder = `\${${key}}`;
        renderedContent = renderedContent.split(placeholder).join(String(value));
      }
      const fullHash = crypto.createHash("sha256").update(renderedContent).digest("hex");
      normalized.content_hash = fullHash.substring(0, 8);
      delete normalized.template;
      delete normalized.variables;
    }

    // Remove type field (it's not stored in provider attributes, it's a top-level field)
    delete normalized.type;

    return normalized;
  }

  private extractRelevantAttributes(
    stateAttrs: Record<string, any>,
    desiredAttrs: Record<string, any>
  ): Record<string, any> {
    const relevant: Record<string, any> = {};
    for (const key of Object.keys(desiredAttrs)) {
      if (key in stateAttrs) {
        relevant[key] = stateAttrs[key];
      }
    }
    return relevant;
  }

  private attributesDiffer(
    oldAttrs: Record<string, any>,
    newAttrs: Record<string, any>
  ): boolean {
    const oldKeys = Object.keys(oldAttrs).sort();
    const newKeys = Object.keys(newAttrs).sort();

    if (oldKeys.length !== newKeys.length) {
      return true;
    }

    for (let i = 0; i < oldKeys.length; i++) {
      if (oldKeys[i] !== newKeys[i]) {
        return true;
      }
    }

    for (const key of oldKeys) {
      if (!this.valueEquals(oldAttrs[key], newAttrs[key])) {
        return true;
      }
    }

    return false;
  }

  private valueEquals(a: any, b: any): boolean {
    if (a === b) {
      return true;
    }

    if (typeof a !== typeof b) {
      return false;
    }

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {
        return false;
      }
      return a.every((item, idx) => this.valueEquals(item, b[idx]));
    }

    if (typeof a === "object" && a !== null && b !== null) {
      const aKeys = Object.keys(a).sort();
      const bKeys = Object.keys(b).sort();

      if (aKeys.length !== bKeys.length) {
        return false;
      }

      for (let i = 0; i < aKeys.length; i++) {
        if (aKeys[i] !== bKeys[i]) {
          return false;
        }
      }

      return aKeys.every((key) => this.valueEquals(a[key], b[key]));
    }

    return false;
  }

  visualizePlan(plan: Plan): string {
    if (plan.changes.length === 0) {
      return "No changes. Infrastructure is up-to-date.";
    }

    let output = `\nTerraform will perform the following actions:\n\n`;

    for (const change of plan.changes) {
      if (change.operation === "no-op") {
        continue;
      }

      const symbol = this.getSymbol(change.operation);
      output += `${symbol} ${change.type}.${change.name}\n`;

      if (change.operation === "create") {
        output += this.visualizeAttributes(change.new_attributes, "+", 2);
      } else if (change.operation === "delete") {
        output += this.visualizeAttributes(change.old_attributes, "-", 2);
      } else if (change.operation === "update") {
        output += this.visualizeAttributeDiff(
          change.old_attributes,
          change.new_attributes,
          2
        );
      }
      output += "\n";
    }

    output += `\nPlan: ${plan.resource_count.create} to add, ${plan.resource_count.update} to change, ${plan.resource_count.delete} to destroy.\n`;

    return output;
  }

  private getSymbol(operation: DiffOperation): string {
    switch (operation) {
      case "create":
        return "+";
      case "update":
        return "~";
      case "delete":
        return "-";
      default:
        return " ";
    }
  }

  private visualizeAttributes(
    attrs: Record<string, any> | undefined,
    prefix: string,
    indent: number
  ): string {
    if (!attrs) {
      return "";
    }

    let output = "";
    const indentStr = " ".repeat(indent);

    for (const [key, value] of Object.entries(attrs)) {
      output += `${indentStr}${prefix} ${key} = ${JSON.stringify(value)}\n`;
    }

    return output;
  }

  private visualizeAttributeDiff(
    oldAttrs: Record<string, any> | undefined,
    newAttrs: Record<string, any> | undefined,
    indent: number
  ): string {
    if (!newAttrs) {
      return "";
    }

    const indentStr = " ".repeat(indent);
    let output = "";
    const oldAttrsMap = oldAttrs || {};

    for (const [key, newValue] of Object.entries(newAttrs)) {
      const oldValue = oldAttrsMap[key];

      if (oldValue === undefined) {
        output += `${indentStr}+ ${key} = ${JSON.stringify(newValue)}\n`;
      } else if (!this.valueEquals(oldValue, newValue)) {
        output += `${indentStr}~ ${key} = ${JSON.stringify(oldValue)} -> ${JSON.stringify(newValue)}\n`;
      }
    }

    for (const key of Object.keys(oldAttrsMap)) {
      if (!(key in newAttrs)) {
        output += `${indentStr}- ${key} = ${JSON.stringify(oldAttrsMap[key])}\n`;
      }
    }

    return output;
  }
}
