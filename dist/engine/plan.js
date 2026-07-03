"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanEngine = void 0;
const logger_1 = require("../utils/logger");
const crypto = __importStar(require("crypto"));
class PlanEngine {
    constructor(stateManager) {
        this.stateManager = stateManager;
    }
    generatePlan(resources, currentState) {
        const changes = [];
        const now = Date.now();
        const stateMap = new Map(currentState.resources.map((r) => [`${r.type}.${r.name}`, r]));
        for (const resource of resources) {
            const resourceKey = `${resource.type}.${resource.name}`;
            const existingState = stateMap.get(resourceKey);
            if (!existingState) {
                changes.push({
                    operation: "create",
                    type: resource.type,
                    name: resource.name,
                    new_attributes: resource.attributes,
                });
            }
            else {
                const normalizedDesired = this.normalizeDesiredAttributes(resource.attributes);
                const relevantStateAttrs = this.extractRelevantAttributes(existingState.attributes, normalizedDesired);
                if (this.attributesDiffer(relevantStateAttrs, normalizedDesired)) {
                    changes.push({
                        operation: "update",
                        type: resource.type,
                        name: resource.name,
                        id: existingState.id,
                        old_attributes: existingState.attributes,
                        new_attributes: resource.attributes,
                    });
                }
                else {
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
        const configResources = new Set(resources.map((r) => `${r.type}.${r.name}`));
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
        const plan = {
            serial: currentState.serial + 1,
            changes,
            resource_count: {
                create: changes.filter((c) => c.operation === "create").length,
                update: changes.filter((c) => c.operation === "update").length,
                delete: changes.filter((c) => c.operation === "delete").length,
            },
            timestamp: now,
        };
        logger_1.logger.debug(`Plan generated: +${plan.resource_count.create} ~${plan.resource_count.update} -${plan.resource_count.delete}`);
        return plan;
    }
    normalizeDesiredAttributes(attrs) {
        const normalized = { ...attrs };
        if ("content" in normalized && typeof normalized.content === "string") {
            const fullHash = crypto.createHash("sha256").update(normalized.content).digest("hex");
            normalized.content_hash = fullHash.substring(0, 8);
            delete normalized.content;
        }
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
        delete normalized.type;
        return normalized;
    }
    extractRelevantAttributes(stateAttrs, desiredAttrs) {
        const relevant = {};
        for (const key of Object.keys(desiredAttrs)) {
            if (key in stateAttrs) {
                relevant[key] = stateAttrs[key];
            }
        }
        return relevant;
    }
    attributesDiffer(oldAttrs, newAttrs) {
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
    valueEquals(a, b) {
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
    visualizePlan(plan) {
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
            }
            else if (change.operation === "delete") {
                output += this.visualizeAttributes(change.old_attributes, "-", 2);
            }
            else if (change.operation === "update") {
                output += this.visualizeAttributeDiff(change.old_attributes, change.new_attributes, 2);
            }
            output += "\n";
        }
        output += `\nPlan: ${plan.resource_count.create} to add, ${plan.resource_count.update} to change, ${plan.resource_count.delete} to destroy.\n`;
        return output;
    }
    getSymbol(operation) {
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
    visualizeAttributes(attrs, prefix, indent) {
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
    visualizeAttributeDiff(oldAttrs, newAttrs, indent) {
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
            }
            else if (!this.valueEquals(oldValue, newValue)) {
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
exports.PlanEngine = PlanEngine;
//# sourceMappingURL=plan.js.map