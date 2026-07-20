import * as fs from "fs";
import * as path from "path";
import { State, StateCheckpoint, ResourceState } from "../types";
import { logger } from "../utils/logger";

export class StateManager {
  private statePath: string;
  private lockPath: string;
  private state: State | null = null;
  private locked: boolean = false;

  constructor(workingDir: string = ".") {
    this.statePath = path.join(workingDir, "terraform.tfstate");
    this.lockPath = path.join(workingDir, "terraform.tfstate.lock");
  }

  lock(): void {
    if (this.locked) {
      throw new Error("State is already locked");
    }
    fs.writeFileSync(this.lockPath, JSON.stringify({ locked_at: new Date() }));
    this.locked = true;
    logger.debug("State locked");
  }

  unlock(): void {
    if (fs.existsSync(this.lockPath)) {
      fs.unlinkSync(this.lockPath);
    }
    this.locked = false;
    logger.debug("State unlocked");
  }

  loadState(): State {
    if (this.state) {
      return this.state;
    }

    if (!fs.existsSync(this.statePath)) {
      logger.debug("No existing state file, creating new state");
      return this.createNewState();
    }

    const content = fs.readFileSync(this.statePath, "utf-8");
    this.state = JSON.parse(content);

    logger.debug(`State loaded with ${this.state!.resources.length} resources`);
    return this.state!;
  }

  private createNewState(): State {
    this.state = {
      version: 4,
      terraform_version: "1.0.0",
      serial: 0,
      lineage: this.generateLineage(),
      resources: [],
      checkpoints: [],
    };
    return this.state;
  }

  private generateLineage(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  saveState(state: State): void {
    if (!this.locked) {
      logger.warn("State not locked, acquiring lock before save");
      this.lock();
    }

    state.serial = (state.serial || 0) + 1;
    this.state = state;

    fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2));
    logger.debug(`State saved with serial ${state.serial}`);
  }

  createCheckpoint(description: string = ""): void {
    if (!this.state) {
      throw new Error("State not loaded");
    }

    const checkpoint: StateCheckpoint = {
      serial: this.state.serial,
      resources: JSON.parse(JSON.stringify(this.state.resources)),
      timestamp: Date.now(),
      description,
    };

    this.state.checkpoints.push(checkpoint);

    if (this.state.checkpoints.length > 10) {
      this.state.checkpoints = this.state.checkpoints.slice(-10);
    }

    logger.debug(`Checkpoint created: ${description}`);
  }

  rollbackToLastCheckpoint(): State {
    if (!this.state || this.state.checkpoints.length === 0) {
      throw new Error("No checkpoints available for rollback");
    }

    const checkpoint = this.state.checkpoints[this.state.checkpoints.length - 1];
    this.state.resources = JSON.parse(JSON.stringify(checkpoint.resources));
    this.state.checkpoints.pop();

    this.saveState(this.state);
    logger.success(`Rolled back to checkpoint: ${checkpoint.description}`);

    return this.state;
  }

  addResource(resource: ResourceState): void {
    if (!this.state) {
      throw new Error("State not loaded");
    }

    const existing = this.state.resources.findIndex(
      (r) => r.type === resource.type && r.name === resource.name
    );

    if (existing >= 0) {
      this.state.resources[existing] = resource;
    } else {
      this.state.resources.push(resource);
    }
  }

  removeResource(type: string, name: string): void {
    if (!this.state) {
      throw new Error("State not loaded");
    }

    this.state.resources = this.state.resources.filter(
      (r) => !(r.type === type && r.name === name)
    );
  }

  getResource(type: string, name: string): ResourceState | undefined {
    if (!this.state) {
      return undefined;
    }

    return this.state.resources.find((r) => r.type === type && r.name === name);
  }

  getAllResources(): ResourceState[] {
    if (!this.state) {
      return [];
    }

    return this.state.resources;
  }

  getCurrentState(): State {
    if (!this.state) {
      return this.loadState();
    }

    return this.state;
  }

  stateFileExists(): boolean {
    return fs.existsSync(this.statePath);
  }

  deleteStateFile(): void {
    if (fs.existsSync(this.statePath)) {
      fs.unlinkSync(this.statePath);
    }
    if (fs.existsSync(this.lockPath)) {
      fs.unlinkSync(this.lockPath);
    }
    this.state = null;
    logger.debug("State files deleted");
  }
}
