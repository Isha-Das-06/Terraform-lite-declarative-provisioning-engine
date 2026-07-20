#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { ConfigParser } from "../config/parser";
import { StateManager } from "../state/manager";
import { DependencyGraphBuilder } from "../graph/builder";
import { PlanEngine } from "../engine/plan";
import { ApplyEngine } from "../engine/apply";
import { FilesystemProvider } from "../providers/filesystem";
import { DockerProvider } from "../providers/docker";
import { LocalDBProvider } from "../providers/localdb";
import { logger, LogLevel } from "../utils/logger";

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "help";

  if (process.env.DEBUG) {
    logger.setLevel(LogLevel.DEBUG);
  }

  try {
    switch (command) {
      case "init":
        await handleInit(args.slice(1));
        break;
      case "plan":
        await handlePlan(args.slice(1));
        break;
      case "apply":
        await handleApply(args.slice(1));
        break;
      case "destroy":
        await handleDestroy(args.slice(1));
        break;
      case "state":
        await handleState(args.slice(1));
        break;
      case "graph":
        await handleGraph(args.slice(1));
        break;
      case "help":
        printHelp();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (error) {
    logger.error("Fatal error", error);
    process.exit(1);
  }
}

function buildProviders(): Map<string, any> {
  // One shared instance per provider so resources of related types
  // (e.g. a sqlite_table referencing a sqlite_database) see the same
  // in-memory provider state during an apply
  const filesystem = new FilesystemProvider();
  const docker = new DockerProvider();
  const localdb = new LocalDBProvider();

  return new Map<string, any>([
    ["file", filesystem],
    ["directory", filesystem],
    ["template", filesystem],
    ["docker_image", docker],
    ["docker_container", docker],
    ["docker_network", docker],
    ["sqlite_database", localdb],
    ["sqlite_table", localdb],
  ]);
}

async function handleInit(args: string[]): Promise<void> {
  const configFile = args[0] || "main.tf.json";

  if (!fs.existsSync(configFile)) {
    throw new Error(`Config file not found: ${configFile}`);
  }

  const stateManager = new StateManager(".");
  const state = stateManager.loadState();

  stateManager.lock();
  stateManager.saveState(state);
  stateManager.unlock();

  logger.success(`Initialized Terraform-Lite working directory`);
  logger.info(`State file: terraform.tfstate`);
}

async function handlePlan(args: string[]): Promise<void> {
  const configFile = args[0] || "main.tf.json";

  if (!fs.existsSync(configFile)) {
    throw new Error(`Config file not found: ${configFile}`);
  }

  logger.info(`Loading configuration from ${configFile}`);

  const configParser = new ConfigParser();
  configParser.loadConfig(configFile);

  const stateManager = new StateManager(".");
  const currentState = stateManager.loadState();

  const resources = configParser.getResources();
  const graphBuilder = new DependencyGraphBuilder();
  const graph = graphBuilder.buildGraph(resources);

  if (graph.hasCycles) {
    throw new Error(`Circular dependencies detected in configuration`);
  }

  const planEngine = new PlanEngine(stateManager);
  const plan = planEngine.generatePlan(resources, currentState);

  console.log(planEngine.visualizePlan(plan));

  logger.info(`To apply these changes, run: tf-lite apply ${configFile}`);
}

async function handleApply(args: string[]): Promise<void> {
  const configFile = args[0] || "main.tf.json";

  if (!fs.existsSync(configFile)) {
    throw new Error(`Config file not found: ${configFile}`);
  }

  logger.info(`Loading configuration from ${configFile}`);

  const configParser = new ConfigParser();
  configParser.loadConfig(configFile);

  const stateManager = new StateManager(".");
  const currentState = stateManager.loadState();

  const resources = configParser.getResources();

  const graphBuilder = new DependencyGraphBuilder();
  const graph = graphBuilder.buildGraph(resources);

  if (graph.hasCycles) {
    throw new Error(`Circular dependencies detected`);
  }

  const planEngine = new PlanEngine(stateManager);
  const plan = planEngine.generatePlan(resources, currentState);

  if (plan.changes.filter((c) => c.operation !== "no-op").length === 0) {
    logger.success("No changes required");
    return;
  }

  console.log(planEngine.visualizePlan(plan));

  const providers = buildProviders();

  const applyEngine = new ApplyEngine(stateManager, providers, graph, resources);
  const result = await applyEngine.apply(plan);

  if (result.success) {
    logger.success("Apply successful");
    logger.info(
      `Created: ${result.resources_created.length}, Updated: ${result.resources_updated.length}, Destroyed: ${result.resources_deleted.length}`
    );
  } else {
    logger.failure("Apply failed");
    for (const error of result.errors) {
      logger.error(error);
    }
    process.exit(1);
  }

  logger.info(`Duration: ${result.duration_ms}ms`);
}

async function handleDestroy(args: string[]): Promise<void> {
  const force = args.includes("--force");
  const positional = args.filter((a) => a !== "--force");
  const configFile = positional[0] || "main.tf.json";

  if (!fs.existsSync(configFile)) {
    throw new Error(`Config file not found: ${configFile}`);
  }

  logger.warn("WARNING: This will destroy all managed resources!");

  if (!force) {
    console.log("To confirm destruction, run:");
    console.log(`  tf-lite destroy ${configFile} --force`);
    logger.info("Destruction cancelled");
    return;
  }

  const configParser = new ConfigParser();
  configParser.loadConfig(configFile);

  const stateManager = new StateManager(".");
  const currentState = stateManager.loadState();

  const resources = configParser.getResources();

  const providers = buildProviders();

  const graphBuilder = new DependencyGraphBuilder();
  const graph = graphBuilder.buildGraph(resources);

  const applyEngine = new ApplyEngine(stateManager, providers, graph, resources);

  const destroyPlan = {
    serial: currentState.serial + 1,
    changes: currentState.resources.map((r) => ({
      operation: "delete" as const,
      type: r.type,
      name: r.name,
      id: r.id,
      old_attributes: r.attributes,
    })),
    resource_count: {
      create: 0,
      update: 0,
      delete: currentState.resources.length,
    },
    timestamp: Date.now(),
  };

  const result = await applyEngine.apply(destroyPlan);

  if (result.success) {
    logger.success("All resources destroyed");
    stateManager.deleteStateFile();
  } else {
    logger.failure("Destruction failed");
  }
}

async function handleState(args: string[]): Promise<void> {
  const subcommand = args[0];

  const stateManager = new StateManager(".");

  if (subcommand === "list") {
    const state = stateManager.loadState();
    if (state.resources.length === 0) {
      logger.info("No resources in state");
      return;
    }

    console.log("\nManaged Resources:");
    console.log("==================\n");

    for (const resource of state.resources) {
      console.log(`${resource.type}.${resource.name}`);
      console.log(`  ID: ${resource.id}`);
      console.log(`  Attributes: ${JSON.stringify(resource.attributes, null, 2)}`);
      console.log();
    }
  } else if (subcommand === "show") {
    const state = stateManager.loadState();
    console.log(JSON.stringify(state, null, 2));
  } else if (subcommand === "rm") {
    const resourceRef = args[1];
    if (!resourceRef) {
      throw new Error("state rm requires a resource reference");
    }

    const [type, name] = resourceRef.split(".");
    const state = stateManager.loadState();
    stateManager.removeResource(type, name);
    stateManager.lock();
    stateManager.saveState(state);
    stateManager.unlock();

    logger.success(`Removed ${type}.${name} from state`);
  } else if (subcommand === "clear") {
    stateManager.deleteStateFile();
    logger.success("State cleared");
  } else {
    console.log("State management commands:");
    console.log("  tf-lite state list       - List all resources");
    console.log("  tf-lite state show       - Show full state");
    console.log("  tf-lite state rm <ref>   - Remove resource from state");
    console.log("  tf-lite state clear      - Clear all state");
  }
}

async function handleGraph(args: string[]): Promise<void> {
  const configFile = args[0] || "main.tf.json";

  if (!fs.existsSync(configFile)) {
    throw new Error(`Config file not found: ${configFile}`);
  }

  const configParser = new ConfigParser();
  configParser.loadConfig(configFile);

  const resources = configParser.getResources();
  const graphBuilder = new DependencyGraphBuilder();
  const graph = graphBuilder.buildGraph(resources);

  console.log(graphBuilder.visualize(graph));
}

function printHelp(): void {
  console.log(`
Terraform-Lite - Declarative Infrastructure Provisioning Engine

Usage: tf-lite <command> [options]

Commands:
  init <config.tf.json>      Initialize working directory
  plan <config.tf.json>      Show what changes will be applied
  apply <config.tf.json>     Apply configuration to provision resources
  destroy <config.tf.json>   Destroy all managed resources
  state <subcommand>         Manage state
    - list                   List all resources
    - show                   Show full state
    - rm <resource>          Remove resource
    - clear                  Clear state
  graph <config.tf.json>     Visualize dependency graph
  help                       Show this help message

Environment Variables:
  DEBUG=1                    Enable debug logging

Examples:
  tf-lite init main.tf.json
  tf-lite plan main.tf.json
  tf-lite apply main.tf.json
  DEBUG=1 tf-lite plan main.tf.json
  `);
}

main().catch((error) => {
  logger.error("Unhandled error", error);
  process.exit(1);
});
