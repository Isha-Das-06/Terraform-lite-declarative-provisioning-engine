import { State, ResourceState } from "../types";
export declare class StateManager {
    private statePath;
    private lockPath;
    private state;
    private locked;
    constructor(workingDir?: string);
    lock(): void;
    unlock(): void;
    loadState(): State;
    private createNewState;
    private generateLineage;
    saveState(state: State): void;
    createCheckpoint(description?: string): void;
    rollbackToLastCheckpoint(): State;
    addResource(resource: ResourceState): void;
    removeResource(type: string, name: string): void;
    getResource(type: string, name: string): ResourceState | undefined;
    getAllResources(): ResourceState[];
    getCurrentState(): State;
    stateFileExists(): boolean;
    deleteStateFile(): void;
}
//# sourceMappingURL=manager.d.ts.map