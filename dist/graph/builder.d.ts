import { Resource, DependencyGraph } from "../types";
export declare class DependencyGraphBuilder {
    private nodes;
    private edges;
    buildGraph(resources: Resource[]): DependencyGraph;
    private extractDependencies;
    private resourceId;
    private detectCycles;
    private hasCycleDFS;
    private findCycles;
    private findCyclePath;
    topologicalSort(graph: DependencyGraph): string[];
    private topologicalSortDFS;
    visualize(graph: DependencyGraph): string;
}
//# sourceMappingURL=builder.d.ts.map