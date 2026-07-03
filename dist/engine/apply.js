"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApplyEngine = void 0;
const builder_1 = require("../graph/builder");
const logger_1 = require("../utils/logger");
class ApplyEngine {
    constructor(stateManager, providers, graph, resources) {
        this.stateManager = stateManager;
        this.providers = providers;
        this.graph = graph;
        this.resources = resources;
        this.appliedResources = [];
        this.startTime = 0;
    }
    async apply(plan) {
        const result = {
            success: false,
            resources_created: [],
            resources_updated: [],
            resources_deleted: [],
            errors: [],
            duration_ms: 0,
        };
        this.startTime = Date.now();
        this.appliedResources = [];
        try {
            this.stateManager.lock();
            logger_1.logger.info("Starting apply...");
            const state = this.stateManager.getCurrentState();
            this.stateManager.createCheckpoint("Before apply");
            const sorted = this.getSortedChanges(plan);
            for (const change of sorted) {
                if (change.operation === "create") {
                    await this.applyCreate(change, result);
                }
                else if (change.operation === "update") {
                    await this.applyUpdate(change, result);
                }
            }
            const deletesInOrder = sorted
                .filter((c) => c.operation === "delete")
                .reverse();
            for (const change of deletesInOrder) {
                await this.applyDelete(change, result);
            }
            this.stateManager.saveState(state);
            result.success = true;
            logger_1.logger.success(`Apply completed successfully`);
        }
        catch (error) {
            logger_1.logger.error("Apply failed, initiating rollback", error);
            result.errors.push(error.message);
            try {
                this.stateManager.rollbackToLastCheckpoint();
                logger_1.logger.success("Rollback completed successfully");
            }
            catch (rollbackError) {
                logger_1.logger.error("Rollback failed", rollbackError);
                result.errors.push(`Rollback failed: ${rollbackError.message}`);
            }
        }
        finally {
            result.duration_ms = Date.now() - this.startTime;
            this.stateManager.unlock();
        }
        return result;
    }
    getSortedChanges(plan) {
        const changeMap = new Map(plan.changes.map((c) => [`${c.type}.${c.name}`, c]));
        const sorted = [];
        const builder = new builder_1.DependencyGraphBuilder();
        const resourceMap = new Map(this.resources.map((r) => [`${r.type}.${r.name}`, r]));
        const dependentResources = this.resources.filter((r) => {
            const resourceKey = `${r.type}.${r.name}`;
            return changeMap.has(resourceKey);
        });
        const graph = builder.buildGraph(dependentResources);
        const order = builder.topologicalSort(graph);
        for (const resourceId of order) {
            const change = changeMap.get(resourceId);
            if (change) {
                sorted.push(change);
            }
        }
        for (const change of plan.changes) {
            const resourceId = `${change.type}.${change.name}`;
            if (!order.includes(resourceId)) {
                sorted.push(change);
            }
        }
        return sorted;
    }
    async applyCreate(change, result) {
        try {
            const provider = this.getProvider(change.type);
            logger_1.logger.info(`Creating ${change.type}.${change.name}`);
            const resource = this.resources.find((r) => r.type === change.type && r.name === change.name);
            if (!resource) {
                throw new Error(`Resource definition not found: ${change.type}.${change.name}`);
            }
            const resourceState = await provider.create(resource.name, resource.attributes);
            const state = this.stateManager.getCurrentState();
            this.stateManager.addResource(resourceState);
            result.resources_created.push(`${change.type}.${change.name}`);
            this.appliedResources.push(resourceState);
            logger_1.logger.success(`Created ${change.type}.${change.name}`);
        }
        catch (error) {
            throw new Error(`Failed to create ${change.type}.${change.name}: ${error.message}`);
        }
    }
    async applyUpdate(change, result) {
        try {
            const provider = this.getProvider(change.type);
            logger_1.logger.info(`Updating ${change.type}.${change.name}`);
            const resource = this.resources.find((r) => r.type === change.type && r.name === change.name);
            if (!resource) {
                throw new Error(`Resource definition not found: ${change.type}.${change.name}`);
            }
            const resourceState = await provider.update(change.id, resource.name, resource.attributes, resource.type);
            this.stateManager.addResource(resourceState);
            result.resources_updated.push(`${change.type}.${change.name}`);
            this.appliedResources.push(resourceState);
            logger_1.logger.success(`Updated ${change.type}.${change.name}`);
        }
        catch (error) {
            throw new Error(`Failed to update ${change.type}.${change.name}: ${error.message}`);
        }
    }
    async applyDelete(change, result) {
        try {
            const provider = this.getProvider(change.type);
            logger_1.logger.info(`Destroying ${change.type}.${change.name}`);
            await provider.delete(change.id, change.old_attributes);
            this.stateManager.removeResource(change.type, change.name);
            result.resources_deleted.push(`${change.type}.${change.name}`);
            logger_1.logger.success(`Destroyed ${change.type}.${change.name}`);
        }
        catch (error) {
            throw new Error(`Failed to destroy ${change.type}.${change.name}: ${error.message}`);
        }
    }
    getProvider(type) {
        const provider = this.providers.get(type);
        if (!provider) {
            throw new Error(`No provider for resource type: ${type}`);
        }
        return provider;
    }
}
exports.ApplyEngine = ApplyEngine;
//# sourceMappingURL=apply.js.map