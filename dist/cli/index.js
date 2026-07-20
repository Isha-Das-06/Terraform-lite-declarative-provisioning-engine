#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const parser_1 = require("../config/parser");
const manager_1 = require("../state/manager");
const builder_1 = require("../graph/builder");
const plan_1 = require("../engine/plan");
const apply_1 = require("../engine/apply");
const filesystem_1 = require("../providers/filesystem");
const docker_1 = require("../providers/docker");
const localdb_1 = require("../providers/localdb");
const logger_1 = require("../utils/logger");
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || "help";
    if (process.env.DEBUG) {
        logger_1.logger.setLevel(logger_1.LogLevel.DEBUG);
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
    }
    catch (error) {
        logger_1.logger.error("Fatal error", error);
        process.exit(1);
    }
}
async function handleInit(args) {
    const configFile = args[0] || "main.tf.json";
    if (!fs.existsSync(configFile)) {
        throw new Error(`Config file not found: ${configFile}`);
    }
    const stateManager = new manager_1.StateManager(".");
    const state = stateManager.loadState();
    stateManager.lock();
    stateManager.saveState(state);
    stateManager.unlock();
    logger_1.logger.success(`Initialized Terraform-Lite working directory`);
    logger_1.logger.info(`State file: terraform.tfstate`);
}
async function handlePlan(args) {
    const configFile = args[0] || "main.tf.json";
    if (!fs.existsSync(configFile)) {
        throw new Error(`Config file not found: ${configFile}`);
    }
    logger_1.logger.info(`Loading configuration from ${configFile}`);
    const configParser = new parser_1.ConfigParser();
    configParser.loadConfig(configFile);
    const stateManager = new manager_1.StateManager(".");
    const currentState = stateManager.loadState();
    const resources = configParser.getResources();
    const graphBuilder = new builder_1.DependencyGraphBuilder();
    const graph = graphBuilder.buildGraph(resources);
    if (graph.hasCycles) {
        throw new Error(`Circular dependencies detected in configuration`);
    }
    const planEngine = new plan_1.PlanEngine(stateManager);
    const plan = planEngine.generatePlan(resources, currentState);
    console.log(planEngine.visualizePlan(plan));
    logger_1.logger.info(`To apply these changes, run: tf-lite apply ${configFile}`);
}
async function handleApply(args) {
    const configFile = args[0] || "main.tf.json";
    if (!fs.existsSync(configFile)) {
        throw new Error(`Config file not found: ${configFile}`);
    }
    logger_1.logger.info(`Loading configuration from ${configFile}`);
    const configParser = new parser_1.ConfigParser();
    configParser.loadConfig(configFile);
    const stateManager = new manager_1.StateManager(".");
    const currentState = stateManager.loadState();
    const resources = configParser.getResources();
    const graphBuilder = new builder_1.DependencyGraphBuilder();
    const graph = graphBuilder.buildGraph(resources);
    if (graph.hasCycles) {
        throw new Error(`Circular dependencies detected`);
    }
    const planEngine = new plan_1.PlanEngine(stateManager);
    const plan = planEngine.generatePlan(resources, currentState);
    if (plan.changes.filter((c) => c.operation !== "no-op").length === 0) {
        logger_1.logger.success("No changes required");
        return;
    }
    console.log(planEngine.visualizePlan(plan));
    const providers = new Map([
        ["file", new filesystem_1.FilesystemProvider()],
        ["directory", new filesystem_1.FilesystemProvider()],
        ["template", new filesystem_1.FilesystemProvider()],
        ["docker_image", new docker_1.DockerProvider()],
        ["docker_container", new docker_1.DockerProvider()],
        ["docker_network", new docker_1.DockerProvider()],
        ["sqlite_database", new localdb_1.LocalDBProvider()],
        ["sqlite_table", new localdb_1.LocalDBProvider()],
    ]);
    const applyEngine = new apply_1.ApplyEngine(stateManager, providers, graph, resources);
    const result = await applyEngine.apply(plan);
    if (result.success) {
        logger_1.logger.success("Apply successful");
        logger_1.logger.info(`Created: ${result.resources_created.length}, Updated: ${result.resources_updated.length}, Destroyed: ${result.resources_deleted.length}`);
    }
    else {
        logger_1.logger.failure("Apply failed");
        for (const error of result.errors) {
            logger_1.logger.error(error);
        }
        process.exit(1);
    }
    logger_1.logger.info(`Duration: ${result.duration_ms}ms`);
}
async function handleDestroy(args) {
    const configFile = args[0] || "main.tf.json";
    if (!fs.existsSync(configFile)) {
        throw new Error(`Config file not found: ${configFile}`);
    }
    logger_1.logger.warn("WARNING: This will destroy all managed resources!");
    console.log("To confirm destruction, run:");
    console.log(`  tf-lite destroy ${configFile} --force`);
    if (!args.includes("--force")) {
        logger_1.logger.info("Destruction cancelled");
        return;
    }
    const configParser = new parser_1.ConfigParser();
    configParser.loadConfig(configFile);
    const stateManager = new manager_1.StateManager(".");
    const currentState = stateManager.loadState();
    const resources = configParser.getResources();
    const providers = new Map([
        ["file", new filesystem_1.FilesystemProvider()],
        ["directory", new filesystem_1.FilesystemProvider()],
        ["template", new filesystem_1.FilesystemProvider()],
        ["docker_image", new docker_1.DockerProvider()],
        ["docker_container", new docker_1.DockerProvider()],
        ["docker_network", new docker_1.DockerProvider()],
        ["sqlite_database", new localdb_1.LocalDBProvider()],
        ["sqlite_table", new localdb_1.LocalDBProvider()],
    ]);
    const graphBuilder = new builder_1.DependencyGraphBuilder();
    const graph = graphBuilder.buildGraph(resources);
    const applyEngine = new apply_1.ApplyEngine(stateManager, providers, graph, resources);
    const destroyPlan = {
        serial: currentState.serial + 1,
        changes: currentState.resources.map((r) => ({
            operation: "delete",
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
        logger_1.logger.success("All resources destroyed");
        stateManager.deleteStateFile();
    }
    else {
        logger_1.logger.failure("Destruction failed");
    }
}
async function handleState(args) {
    const subcommand = args[0];
    const stateManager = new manager_1.StateManager(".");
    if (subcommand === "list") {
        const state = stateManager.loadState();
        if (state.resources.length === 0) {
            logger_1.logger.info("No resources in state");
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
    }
    else if (subcommand === "show") {
        const state = stateManager.loadState();
        console.log(JSON.stringify(state, null, 2));
    }
    else if (subcommand === "rm") {
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
        logger_1.logger.success(`Removed ${type}.${name} from state`);
    }
    else if (subcommand === "clear") {
        stateManager.deleteStateFile();
        logger_1.logger.success("State cleared");
    }
    else {
        console.log("State management commands:");
        console.log("  tf-lite state list       - List all resources");
        console.log("  tf-lite state show       - Show full state");
        console.log("  tf-lite state rm <ref>   - Remove resource from state");
        console.log("  tf-lite state clear      - Clear all state");
    }
}
async function handleGraph(args) {
    const configFile = args[0] || "main.tf.json";
    if (!fs.existsSync(configFile)) {
        throw new Error(`Config file not found: ${configFile}`);
    }
    const configParser = new parser_1.ConfigParser();
    configParser.loadConfig(configFile);
    const resources = configParser.getResources();
    const graphBuilder = new builder_1.DependencyGraphBuilder();
    const graph = graphBuilder.buildGraph(resources);
    console.log(graphBuilder.visualize(graph));
}
function printHelp() {
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
    logger_1.logger.error("Unhandled error", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map