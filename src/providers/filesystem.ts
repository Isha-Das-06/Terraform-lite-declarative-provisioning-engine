import * as fs from "fs";
import * as path from "path";
import { BaseProvider } from "./base";
import { ResourceState } from "../types";
import { logger } from "../utils/logger";

export class FilesystemProvider extends BaseProvider {
  name = "filesystem";
  supportedTypes = ["file", "directory"];

  async create(
    resourceName: string,
    attributes: Record<string, any>
  ): Promise<ResourceState> {
    const type = attributes.type || "file";

    if (type === "directory") {
      return this.createDirectory(resourceName, attributes);
    } else if (type === "file") {
      return this.createFile(resourceName, attributes);
    } else if (type === "template") {
      return this.createTemplate(resourceName, attributes);
    }

    throw new Error(`Unsupported filesystem resource type: ${type}`);
  }

  private async createFile(
    resourceName: string,
    attributes: Record<string, any>
  ): Promise<ResourceState> {
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

    const resourceState: ResourceState = {
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

  private async createDirectory(
    resourceName: string,
    attributes: Record<string, any>
  ): Promise<ResourceState> {
    const dirPath = attributes.path;
    const permissions = attributes.permissions || "0755";

    if (!dirPath) {
      throw new Error("Directory resource requires 'path' attribute");
    }

    const mode = permissions && permissions !== "0755" ? parseInt(permissions, 8) : undefined;
    fs.mkdirSync(dirPath, { recursive: true, mode });

    const id = this.generateId("dir");
    const stats = fs.statSync(dirPath);

    const resourceState: ResourceState = {
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

  private async createTemplate(
    resourceName: string,
    attributes: Record<string, any>
  ): Promise<ResourceState> {
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

    const resourceState: ResourceState = {
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

  async read(id: string): Promise<ResourceState | null> {
    return null;
  }

  async update(
    id: string,
    resourceName: string,
    attributes: Record<string, any>,
    resourceType?: string
  ): Promise<ResourceState> {
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
    } else {
      return this.updateFile(id, filePath, resourceName, attributes, resourceType);
    }
  }

  private async updateFile(
    id: string,
    filePath: string,
    resourceName: string,
    attributes: Record<string, any>,
    resourceType?: string
  ): Promise<ResourceState> {
    let newContent = attributes.content || "";

    // Handle template with variable interpolation
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

    // Preserve the original resource type (template or file)
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

  private async updateDirectory(
    id: string,
    dirPath: string,
    resourceName: string,
    attributes: Record<string, any>
  ): Promise<ResourceState> {
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

  async delete(id: string, attributes?: Record<string, any>): Promise<void> {
    if (!attributes || !attributes.path) {
      return;
    }

    const filePath = attributes.path;
    if (!fs.existsSync(filePath)) {
      logger.warn(`Path not found: ${filePath}`);
      return;
    }

    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      fs.rmSync(filePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(filePath);
    }
  }

  async exists(id: string): Promise<boolean> {
    return Promise.resolve(true);
  }

  private hashContent(content: string): string {
    const crypto = require("crypto");
    return crypto.createHash("sha256").update(content).digest("hex").substring(0, 8);
  }
}
