import { Plan, ApplyResult, ResourceState, Resource, DependencyGraph } from "../types";
import { StateManager } from "../state/manager";
import { BaseProvider } from "../providers/base";
import { DependencyGraphBuilder } from "../graph/builder";
import { logger } from "../utils/logger";

export class ApplyEngine {
  private appliedResources: ResourceState[] = [];
  private startTime: number = 0;

  constructor(
    private stateManager: StateManager,
    private providers: Map<string, BaseProvider>,
    private graph: DependencyGraph,
    private resources: Resource[]
  ) {}

  async apply(plan: Plan): Promise<ApplyResult> {
    const result: ApplyResult = {
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
      logger.info("Starting apply...");

      const state = this.stateManager.getCurrentState();
      this.stateManager.createCheckpoint("Before apply");

      // Sort changes by dependency order
      const sorted = this.getSortedChanges(plan);

      // Apply creates and updates (in dependency order)
      for (const change of sorted) {
        if (change.operation === "create") {
          await this.applyCreate(change, result);
        } else if (change.operation === "update") {
          await this.applyUpdate(change, result);
        }
      }

      // Apply deletes in reverse dependency order
      const deletesInOrder = sorted
        .filter((c) => c.operation === "delete")
        .reverse();
      for (const change of deletesInOrder) {
        await this.applyDelete(change, result);
      }

      // Save final state
      this.stateManager.saveState(state);
      result.success = true;
      logger.success(`Apply completed successfully`);
    } catch (error) {
      logger.error("Apply failed, initiating rollback", error);
      result.errors.push((error as Error).message);

      try {
        this.stateManager.rollbackToLastCheckpoint();
        logger.success("Rollback completed successfully");
      } catch (rollbackError) {
        logger.error("Rollback failed", rollbackError);
        result.errors.push(`Rollback failed: ${(rollbackError as Error).message}`);
      }
    } finally {
      result.duration_ms = Date.now() - this.startTime;
      this.stateManager.unlock();
    }

    return result;
  }

  private getSortedChanges(plan: Plan) {
    // Sort by dependency order for creates/updates
    const changeMap = new Map(plan.changes.map((c) => [`${c.type}.${c.name}`, c]));
    const sorted = [];

    // Get topological order
    const builder = new DependencyGraphBuilder();
    const resourceMap = new Map(
      this.resources.map((r) => [`${r.type}.${r.name}`, r])
    );
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

    // Add any remaining changes not in dependency order
    for (const change of plan.changes) {
      const resourceId = `${change.type}.${change.name}`;
      if (!order.includes(resourceId)) {
        sorted.push(change);
      }
    }

    return sorted;
  }

  private async applyCreate(change: any, result: ApplyResult): Promise<void> {
    try {
      const provider = this.getProvider(change.type);
      logger.info(`Creating ${change.type}.${change.name}`);

      const resource = this.resources.find(
        (r) => r.type === change.type && r.name === change.name
      );

      if (!resource) {
        throw new Error(
          `Resource definition not found: ${change.type}.${change.name}`
        );
      }

      const resourceState = await provider.create(resource.name, resource.attributes);

      const state = this.stateManager.getCurrentState();
      this.stateManager.addResource(resourceState);

      result.resources_created.push(`${change.type}.${change.name}`);
      this.appliedResources.push(resourceState);

      logger.success(`Created ${change.type}.${change.name}`);
    } catch (error) {
      throw new Error(
        `Failed to create ${change.type}.${change.name}: ${(error as Error).message}`
      );
    }
  }

  private async applyUpdate(change: any, result: ApplyResult): Promise<void> {
    try {
      const provider = this.getProvider(change.type);
      logger.info(`Updating ${change.type}.${change.name}`);

      const resource = this.resources.find(
        (r) => r.type === change.type && r.name === change.name
      );

      if (!resource) {
        throw new Error(
          `Resource definition not found: ${change.type}.${change.name}`
        );
      }

      const resourceState = await provider.update(
        change.id,
        resource.name,
        resource.attributes,
        resource.type
      );

      this.stateManager.addResource(resourceState);

      result.resources_updated.push(`${change.type}.${change.name}`);
      this.appliedResources.push(resourceState);

      logger.success(`Updated ${change.type}.${change.name}`);
    } catch (error) {
      throw new Error(
        `Failed to update ${change.type}.${change.name}: ${(error as Error).message}`
      );
    }
  }

  private async applyDelete(change: any, result: ApplyResult): Promise<void> {
    try {
      const provider = this.getProvider(change.type);
      logger.info(`Destroying ${change.type}.${change.name}`);

      await provider.delete(change.id, change.old_attributes);

      this.stateManager.removeResource(change.type, change.name);

      result.resources_deleted.push(`${change.type}.${change.name}`);

      logger.success(`Destroyed ${change.type}.${change.name}`);
    } catch (error) {
      throw new Error(
        `Failed to destroy ${change.type}.${change.name}: ${(error as Error).message}`
      );
    }
  }

  private getProvider(type: string): BaseProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      throw new Error(`No provider for resource type: ${type}`);
    }
    return provider;
  }
}
