import { Plan, ApplyResult, Resource, DependencyGraph } from "../types";
import { StateManager } from "../state/manager";
import { BaseProvider } from "../providers/base";
export declare class ApplyEngine {
    private stateManager;
    private providers;
    private graph;
    private resources;
    private appliedResources;
    private startTime;
    constructor(stateManager: StateManager, providers: Map<string, BaseProvider>, graph: DependencyGraph, resources: Resource[]);
    apply(plan: Plan): Promise<ApplyResult>;
    private getSortedChanges;
    private applyCreate;
    private applyUpdate;
    private applyDelete;
    private getProvider;
}
//# sourceMappingURL=apply.d.ts.map