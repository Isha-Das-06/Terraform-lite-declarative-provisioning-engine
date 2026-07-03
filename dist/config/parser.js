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
exports.ConfigParser = void 0;
const fs = __importStar(require("fs"));
const validation_1 = require("../utils/validation");
const logger_1 = require("../utils/logger");
class ConfigParser {
    constructor() {
        this.config = {};
        this.variables = {};
    }
    loadConfig(filePath) {
        logger_1.logger.debug(`Loading config from ${filePath}`);
        if (!fs.existsSync(filePath)) {
            throw new Error(`Config file not found: ${filePath}`);
        }
        const content = fs.readFileSync(filePath, "utf-8");
        const config = JSON.parse(content);
        (0, validation_1.validateConfig)(config);
        this.config = config;
        this.processVariables();
        return config;
    }
    processVariables() {
        const variables = this.config.variable || {};
        for (const [name, varDef] of Object.entries(variables)) {
            if (varDef.default !== undefined) {
                this.variables[name] = varDef.default;
            }
        }
        logger_1.logger.debug("Variables loaded", Object.keys(this.variables));
    }
    getResources() {
        const resources = [];
        if (!this.config.resource) {
            return resources;
        }
        for (const [type, typeResources] of Object.entries(this.config.resource)) {
            for (const [name, attributes] of Object.entries(typeResources)) {
                const resource = {
                    type,
                    name,
                    attributes: this.interpolateAttributes(attributes),
                    depends_on: attributes.depends_on,
                };
                resources.push(resource);
            }
        }
        return resources;
    }
    interpolateAttributes(attributes) {
        const attrs = { ...attributes };
        delete attrs.depends_on;
        return (0, validation_1.interpolateVariables)(attrs, this.variables);
    }
    getConfig() {
        return this.config;
    }
    getVariables() {
        return { ...this.variables };
    }
    setVariable(name, value) {
        this.variables[name] = value;
    }
}
exports.ConfigParser = ConfigParser;
//# sourceMappingURL=parser.js.map