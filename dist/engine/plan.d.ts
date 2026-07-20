import { Resource, State, Plan } from "../types";
import { StateManager } from "../state/manager";
export declare class PlanEngine {
    private stateManager;
    constructor(stateManager: StateManager);
    generatePlan(resources: Resource[], currentState: State): Plan;
    private normalizeDesiredAttributes;
    private extractRelevantAttributes;
    private attributesDiffer;
    private valueEquals;
    visualizePlan(plan: Plan): string;
    private getSymbol;
    private visualizeAttributes;
    private visualizeAttributeDiff;
}
//# sourceMappingURL=plan.d.ts.map