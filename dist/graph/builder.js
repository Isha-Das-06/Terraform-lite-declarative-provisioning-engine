"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DependencyGraphBuilder = void 0;
const logger_1 = require("../utils/logger");
const validation_1 = require("../utils/validation");
class DependencyGraphBuilder {
    constructor() {
        this.nodes = new Map();
        this.edges = new Map();
    }
    buildGraph(resources) {
        this.nodes.clear();
        this.edges.clear();
        for (const resource of resources) {
            const nodeId = this.resourceId(resource.type, resource.name);
            this.nodes.set(nodeId, {
                id: nodeId,
                type: resource.type,
                name: resource.name,
                dependencies: [],
            });
            this.edges.set(nodeId, []);
        }
        for (const resource of resources) {
            const nodeId = this.resourceId(resource.type, resource.name);
            const dependencies = this.extractDependencies(resource);
            for (const dep of dependencies) {
                if (!this.nodes.has(dep)) {
                    throw new validation_1.ValidationError(`Dependency ${dep} not found for resource ${nodeId}`);
                }
                this.edges.get(nodeId).push(dep);
            }
            const node = this.nodes.get(nodeId);
            node.dependencies = dependencies;
        }
        const hasCycles = this.detectCycles();
        const cycles = this.findCycles();
        logger_1.logger.debug(`Graph built with ${this.nodes.size} nodes and ${Array.from(this.edges.values()).reduce((sum, arr) => sum + arr.length, 0)} edges`);
        return {
            nodes: Array.from(this.nodes.values()),
            edges: this.edges,
            hasCycles,
            cycles,
        };
    }
    extractDependencies(resource) {
        const dependencies = new Set();
        if (resource.depends_on) {
            for (const dep of resource.depends_on) {
                const parsed = (0, validation_1.parseResourceRef)(dep);
                dependencies.add(this.resourceId(parsed.type, parsed.name));
            }
        }
        const attrs = JSON.stringify(resource.attributes);
        const refPattern = /\$\{([\w.]+)\}/g;
        let match;
        while ((match = refPattern.exec(attrs)) !== null) {
            const ref = match[1];
            if (ref.includes(".")) {
                try {
                    const parsed = (0, validation_1.parseResourceRef)(ref);
                    const depId = this.resourceId(parsed.type, parsed.name);
                    if (this.nodes.has(depId)) {
                        dependencies.add(depId);
                    }
                }
                catch {
                }
            }
        }
        return Array.from(dependencies);
    }
    resourceId(type, name) {
        return `${type}.${name}`;
    }
    detectCycles() {
        const visited = new Set();
        const recursionStack = new Set();
        for (const nodeId of this.nodes.keys()) {
            if (this.hasCycleDFS(nodeId, visited, recursionStack)) {
                return true;
            }
        }
        return false;
    }
    hasCycleDFS(nodeId, visited, recursionStack) {
        if (recursionStack.has(nodeId)) {
            return true;
        }
        if (visited.has(nodeId)) {
            return false;
        }
        visited.add(nodeId);
        recursionStack.add(nodeId);
        const dependencies = this.edges.get(nodeId) || [];
        for (const dep of dependencies) {
            if (this.hasCycleDFS(dep, visited, recursionStack)) {
                return true;
            }
        }
        recursionStack.delete(nodeId);
        return false;
    }
    findCycles() {
        const cycles = [];
        const visited = new Set();
        for (const nodeId of this.nodes.keys()) {
            if (!visited.has(nodeId)) {
                const cycle = this.findCyclePath(nodeId, [], new Set(), visited);
                if (cycle.length > 0) {
                    cycles.push(cycle);
                }
            }
        }
        return cycles;
    }
    findCyclePath(current, path, localVisited, globalVisited) {
        if (localVisited.has(current)) {
            const cycleStart = path.indexOf(current);
            if (cycleStart >= 0) {
                return path.slice(cycleStart).concat([current]);
            }
        }
        if (globalVisited.has(current)) {
            return [];
        }
        path.push(current);
        localVisited.add(current);
        const dependencies = this.edges.get(current) || [];
        for (const dep of dependencies) {
            const cycle = this.findCyclePath(dep, [...path], new Set(localVisited), globalVisited);
            if (cycle.length > 0) {
                return cycle;
            }
        }
        globalVisited.add(current);
        return [];
    }
    topologicalSort(graph) {
        if (graph.hasCycles) {
            throw new Error(`Circular dependencies detected: ${graph.cycles.join(" -> ")}`);
        }
        const visited = new Set();
        const sorted = [];
        for (const node of graph.nodes) {
            if (!visited.has(node.id)) {
                this.topologicalSortDFS(node.id, graph.edges, visited, sorted);
            }
        }
        return sorted;
    }
    topologicalSortDFS(nodeId, edges, visited, sorted) {
        visited.add(nodeId);
        const dependencies = edges.get(nodeId) || [];
        for (const dep of dependencies) {
            if (!visited.has(dep)) {
                this.topologicalSortDFS(dep, edges, visited, sorted);
            }
        }
        sorted.push(nodeId);
    }
    visualize(graph) {
        let output = "Dependency Graph:\n";
        output += "==================\n\n";
        for (const node of graph.nodes) {
            output += `${node.id}\n`;
            if (node.dependencies.length > 0) {
                for (const dep of node.dependencies) {
                    output += `  └─> ${dep}\n`;
                }
            }
            else {
                output += `  └─> (no dependencies)\n`;
            }
        }
        if (graph.hasCycles) {
            output += "\n⚠️  CIRCULAR DEPENDENCIES DETECTED:\n";
            for (const cycle of graph.cycles) {
                output += `  ${cycle.join(" -> ")}\n`;
            }
        }
        return output;
    }
}
exports.DependencyGraphBuilder = DependencyGraphBuilder;
//# sourceMappingURL=builder.js.map