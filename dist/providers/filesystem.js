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
exports.FilesystemProvider = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const base_1 = require("./base");
const logger_1 = require("../utils/logger");
class FilesystemProvider extends base_1.BaseProvider {
    constructor() {
        super(...arguments);
        this.name = "filesystem";
        this.supportedTypes = ["file", "directory"];
    }
    async create(resourceName, attributes) {
        const type = attributes.type || "file";
        if (type === "directory") {
            return this.createDirectory(resourceName, attributes);
        }
        else if (type === "file") {
            return this.createFile(resourceName, attributes);
        }
        else if (type === "template") {
            return this.createTemplate(resourceName, attributes);
        }
        throw new Error(`Unsupported filesystem resource type: ${type}`);
    }
    async createFile(resourceName, attributes) {
        const filePath = attributes.path || attributes.filename;
        const content = attributes.content || "";
        const permissions = attributes.permissions || "0644";
        if (!filePath) {
            throw new Error("File resource requires 'path' or 'filename' attribute");
        }
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, content, "utf-8");
        if (permissions && permissions !== "0644") {
            const mode = parseInt(permissions, 8);
            fs.chmodSync(filePath, mode);
        }
        const id = this.generateId("file");
        const fileStats = fs.statSync(filePath);
        const resourceState = {
            type: "file",
            name: resourceName,
            id,
            attributes: {
                path: filePath,
                content_hash: this.hashContent(content),
                size: fileStats.size,
                permissions,
                created_at: new Date().toISOString(),
            },
            timestamp: Date.now(),
        };
        return resourceState;
    }
    async createDirectory(resourceName, attributes) {
        const dirPath = attributes.path;
        const permissions = attributes.permissions || "0755";
        if (!dirPath) {
            throw new Error("Directory resource requires 'path' attribute");
        }
        const mode = permissions && permissions !== "0755" ? parseInt(permissions, 8) : undefined;
        fs.mkdirSync(dirPath, { recursive: true, mode });
        const id = this.generateId("dir");
        const stats = fs.statSync(dirPath);
        const resourceState = {
            type: "directory",
            name: resourceName,
            id,
            attributes: {
                path: dirPath,
                permissions,
                created_at: new Date().toISOString(),
            },
            timestamp: Date.now(),
        };
        return resourceState;
    }
    async createTemplate(resourceName, attributes) {
        const filePath = attributes.path;
        const templateContent = attributes.template;
        const vars = attributes.variables || {};
        if (!filePath) {
            throw new Error("Template resource requires 'path' attribute");
        }
        if (!templateContent) {
            throw new Error("Template resource requires 'template' attribute");
        }
        let content = templateContent;
        for (const [key, value] of Object.entries(vars)) {
            const placeholder = `\${${key}}`;
            content = content.split(placeholder).join(String(value));
        }
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, content, "utf-8");
        const id = this.generateId("template");
        const resourceState = {
            type: "template",
            name: resourceName,
            id,
            attributes: {
                path: filePath,
                content_hash: this.hashContent(content),
                created_at: new Date().toISOString(),
            },
            timestamp: Date.now(),
        };
        return resourceState;
    }
    async read(id) {
        return null;
    }
    async update(id, resourceName, attributes, resourceType) {
        const filePath = attributes.path;
        if (!filePath) {
            throw new Error("Resource attributes must contain 'path'");
        }
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }
        const stats = fs.statSync(filePath);
        const isDir = stats.isDirectory();
        if (isDir) {
            return this.updateDirectory(id, filePath, resourceName, attributes);
        }
        else {
            return this.updateFile(id, filePath, resourceName, attributes, resourceType);
        }
    }
    async updateFile(id, filePath, resourceName, attributes, resourceType) {
        let newContent = attributes.content || "";
        if (attributes.template) {
            newContent = attributes.template;
            const vars = attributes.variables || {};
            for (const [key, value] of Object.entries(vars)) {
                const placeholder = `\${${key}}`;
                newContent = newContent.split(placeholder).join(String(value));
            }
        }
        fs.writeFileSync(filePath, newContent, "utf-8");
        const stats = fs.statSync(filePath);
        const type = resourceType || "file";
        return {
            type,
            name: resourceName,
            id,
            attributes: {
                path: filePath,
                content_hash: this.hashContent(newContent),
                size: stats.size,
            },
            timestamp: Date.now(),
        };
    }
    async updateDirectory(id, dirPath, resourceName, attributes) {
        const permissions = attributes.permissions;
        if (permissions && permissions !== "0755") {
            const mode = parseInt(permissions, 8);
            fs.chmodSync(dirPath, mode);
        }
        return {
            type: "directory",
            name: resourceName,
            id,
            attributes: {
                path: dirPath,
                permissions,
            },
            timestamp: Date.now(),
        };
    }
    async delete(id, attributes) {
        if (!attributes || !attributes.path) {
            return;
        }
        const filePath = attributes.path;
        if (!fs.existsSync(filePath)) {
            logger_1.logger.warn(`Path not found: ${filePath}`);
            return;
        }
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
            fs.rmSync(filePath, { recursive: true, force: true });
        }
        else {
            fs.unlinkSync(filePath);
        }
    }
    async exists(id) {
        return Promise.resolve(true);
    }
    hashContent(content) {
        const crypto = require("crypto");
        return crypto.createHash("sha256").update(content).digest("hex").substring(0, 8);
    }
}
exports.FilesystemProvider = FilesystemProvider;
//# sourceMappingURL=filesystem.js.map