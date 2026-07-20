import { Resource, DependencyGraph, GraphNode } from "../types";
import { logger } from "../utils/logger";
import { parseResourceRef, ValidationError } from "../utils/validation";

export class DependencyGraphBuilder {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, string[]> = new Map();

  buildGraph(resources: Resource[]): DependencyGraph {
    this.nodes.clear();
    this.edges.clear();

    // Create nodes
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

    // Create edges
    for (const resource of resources) {
      const nodeId = this.resourceId(resource.type, resource.name);
      const dependencies = this.extractDependencies(resource);

      for (const dep of dependencies) {
        if (!this.nodes.has(dep)) {
          throw new ValidationError(
            `Dependency ${dep} not found for resource ${nodeId}`
          );
        }
        this.edges.get(nodeId)!.push(dep);
      }

      const node = this.nodes.get(nodeId)!;
      node.dependencies = dependencies;
    }

    const hasCycles = this.detectCycles();
    const cycles = this.findCycles();

    logger.debug(
      `Graph built with ${this.nodes.size} nodes and ${Array.from(this.edges.values()).reduce((sum, arr) => sum + arr.length, 0)} edges`
    );

    return {
      nodes: Array.from(this.nodes.values()),
      edges: this.edges,
      hasCycles,
      cycles,
    };
  }

  private extractDependencies(resource: Resource): string[] {
    const dependencies: Set<string> = new Set();

    // Explicit dependencies
    if (resource.depends_on) {
      for (const dep of resource.depends_on) {
        const parsed = parseResourceRef(dep);
        dependencies.add(this.resourceId(parsed.type, parsed.name));
      }
    }

    // Implicit dependencies from attributes
    const attrs = JSON.stringify(resource.attributes);
    const refPattern = /\$\{([\w.]+)\}/g;
    let match;

    while ((match = refPattern.exec(attrs)) !== null) {
      const ref = match[1];
      if (ref.includes(".")) {
        try {
          const parsed = parseResourceRef(ref);
          const depId = this.resourceId(parsed.type, parsed.name);

          // Only add if it's a real resource (not a variable or output)
          if (this.nodes.has(depId)) {
            dependencies.add(depId);
          }
        } catch {
          // Ignore invalid references
        }
      }
    }

    return Array.from(dependencies);
  }

  private resourceId(type: string, name: string): string {
    return `${type}.${name}`;
  }

  private detectCycles(): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    for (const nodeId of this.nodes.keys()) {
      if (this.hasCycleDFS(nodeId, visited, recursionStack)) {
        return true;
      }
    }

    return false;
  }

  private hasCycleDFS(
    nodeId: string,
    visited: Set<string>,
    recursionStack: Set<string>
  ): boolean {
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

  private findCycles(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();

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

  private findCyclePath(
    current: string,
    path: string[],
    localVisited: Set<string>,
    globalVisited: Set<string>
  ): string[] {
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
      const cycle = this.findCyclePath(
        dep,
        [...path],
        new Set(localVisited),
        globalVisited
      );
      if (cycle.length > 0) {
        return cycle;
      }
    }

    globalVisited.add(current);
    return [];
  }

  topologicalSort(graph: DependencyGraph): string[] {
    if (graph.hasCycles) {
      throw new Error(
        `Circular dependencies detected: ${graph.cycles
          .map((cycle) => cycle.join(" -> "))
          .join("; ")}`
      );
    }

    const visited = new Set<string>();
    const sorted: string[] = [];

    for (const node of graph.nodes) {
      if (!visited.has(node.id)) {
        this.topologicalSortDFS(node.id, graph.edges, visited, sorted);
      }
    }

    return sorted;
  }

  private topologicalSortDFS(
    nodeId: string,
    edges: Map<string, string[]>,
    visited: Set<string>,
    sorted: string[]
  ): void {
    visited.add(nodeId);

    const dependencies = edges.get(nodeId) || [];
    for (const dep of dependencies) {
      if (!visited.has(dep)) {
        this.topologicalSortDFS(dep, edges, visited, sorted);
      }
    }

    sorted.push(nodeId);
  }

  visualize(graph: DependencyGraph): string {
    let output = "Dependency Graph:\n";
    output += "==================\n\n";

    for (const node of graph.nodes) {
      output += `${node.id}\n`;
      if (node.dependencies.length > 0) {
        for (const dep of node.dependencies) {
          output += `  └─> ${dep}\n`;
        }
      } else {
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
