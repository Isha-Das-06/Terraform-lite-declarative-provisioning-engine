"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DockerProvider = void 0;
const base_1 = require("./base");
const logger_1 = require("../utils/logger");
class DockerProvider extends base_1.BaseProvider {
    constructor() {
        super(...arguments);
        this.name = "docker";
        this.supportedTypes = ["docker_image", "docker_container", "docker_network"];
    }
    async create(resourceName, attributes) {
        const type = attributes.type || attributes.resource_type;
        if (type === "image") {
            return this.createImage(resourceName, attributes);
        }
        else if (type === "container") {
            return this.createContainer(resourceName, attributes);
        }
        else if (type === "network") {
            return this.createNetwork(resourceName, attributes);
        }
        throw new Error(`Unsupported docker resource type: ${type}`);
    }
    async createImage(resourceName, attributes) {
        const imageId = this.generateId("docker-image");
        const name = attributes.name || attributes.image_name || resourceName;
        const tag = attributes.tag || "latest";
        logger_1.logger.debug(`Docker image created: ${name}:${tag}`);
        return {
            type: "docker_image",
            name: resourceName,
            id: imageId,
            attributes: {
                name,
                tag,
                repo_digest: `sha256:${Math.random().toString(16).slice(2)}`,
                size: Math.floor(Math.random() * 1000) + 100,
            },
            timestamp: Date.now(),
        };
    }
    async createContainer(resourceName, attributes) {
        const containerId = this.generateId("docker-container");
        const image = attributes.image || attributes.image_id;
        const name = attributes.name || attributes.container_name || resourceName;
        const ports = attributes.ports || [];
        const env = attributes.env || [];
        const memory = attributes.memory || 512;
        if (!image) {
            throw new Error("Container requires 'image' or 'image_id' attribute");
        }
        logger_1.logger.debug(`Docker container created: ${name}`);
        return {
            type: "docker_container",
            name: resourceName,
            id: containerId,
            attributes: {
                name,
                image,
                status: "running",
                ports: ports.length > 0 ? ports : undefined,
                memory,
                ip_address: `172.17.0.${Math.floor(Math.random() * 254) + 1}`,
            },
            timestamp: Date.now(),
        };
    }
    async createNetwork(resourceName, attributes) {
        const networkId = this.generateId("docker-network");
        const name = attributes.name || resourceName;
        const driver = attributes.driver || "bridge";
        const subnet = attributes.subnet || "172.20.0.0/16";
        logger_1.logger.debug(`Docker network created: ${name}`);
        return {
            type: "docker_network",
            name: resourceName,
            id: networkId,
            attributes: {
                name,
                driver,
                subnet,
            },
            timestamp: Date.now(),
        };
    }
    async read(id) {
        return null;
    }
    async update(id, resourceName, attributes, resourceType) {
        return {
            type: "docker_container",
            name: resourceName,
            id,
            attributes,
            timestamp: Date.now(),
        };
    }
    async delete(id, attributes) {
        if (attributes) {
            logger_1.logger.debug(`Deleted Docker resource: ${attributes.name}`);
        }
    }
    async exists(id) {
        return true;
    }
}
exports.DockerProvider = DockerProvider;
//# sourceMappingURL=docker.js.map