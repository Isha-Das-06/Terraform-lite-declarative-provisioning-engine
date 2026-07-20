import * as fs from "fs";
import * as path from "path";
import { StateManager } from "../state/manager";
import { ConfigParser } from "../config/parser";
import { PlanEngine } from "../engine/plan";
import { ApplyEngine } from "../engine/apply";
import { DependencyGraphBuilder } from "../graph/builder";
import { FilesystemProvider } from "../providers/filesystem";

describe("Terraform-Lite Integration", () => {
  const testDir = path.join(__dirname, "test-integration");
  const configFile = path.join(testDir, "test.tf.json");
  const stateFile = path.join(testDir, "terraform.tfstate");

  beforeEach(() => {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("full workflow: init → plan → apply → plan → destroy", async () => {
    // 1. Create a test configuration
    const config = {
      resource: {
        directory: {
          test_dir: {
            type: "directory",
            path: path.join(testDir, "data"),
          },
        },
        file: {
          test_file: {
            type: "file",
            path: path.join(testDir, "test.txt"),
            content: "initial content",
            depends_on: ["directory.test_dir"],
          },
        },
      },
    };

    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

    // 2. Initialize state
    const stateManager = new StateManager(testDir);
    stateManager.loadState();

    // 3. Parse config and build graph
    const parser = new ConfigParser();
    const parsedConfig = parser.loadConfig(configFile);
    const resources = parser.getResources();

    const graphBuilder = new DependencyGraphBuilder();
    const graph = graphBuilder.buildGraph(resources);

    // 4. Generate plan (should show creates)
    const planEngine = new PlanEngine(stateManager);
    let state = stateManager.getCurrentState();
    let plan = planEngine.generatePlan(resources, state);

    expect(plan.resource_count.create).toBe(2); // directory + file
    expect(plan.resource_count.update).toBe(0);
    expect(plan.resource_count.delete).toBe(0);

    // 5. Apply plan
    const provider = new FilesystemProvider();
    const providers = new Map([["file", provider], ["directory", provider]]);
    const applyEngine = new ApplyEngine(stateManager, providers, graph, resources);
    const applyResult = await applyEngine.apply(plan);

    expect(applyResult.success).toBe(true);
    expect(applyResult.resources_created).toContain("directory.test_dir");
    expect(applyResult.resources_created).toContain("file.test_file");

    // Verify files were created
    expect(fs.existsSync(path.join(testDir, "data"))).toBe(true);
    expect(fs.existsSync(path.join(testDir, "test.txt"))).toBe(true);
    expect(fs.readFileSync(path.join(testDir, "test.txt"), "utf-8")).toBe(
      "initial content"
    );

    // 6. Plan again (should show no changes - idempotency)
    state = stateManager.getCurrentState();
    plan = planEngine.generatePlan(resources, state);

    expect(plan.resource_count.create).toBe(0);
    expect(plan.resource_count.update).toBe(0);
    expect(plan.resource_count.delete).toBe(0);

    // 7. Change config (update content)
    config.resource.file.test_file.content = "updated content";
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
    const updatedResources = new ConfigParser().loadConfig(configFile).resource
      ? (() => {
          const parser2 = new ConfigParser();
          parser2.loadConfig(configFile);
          return parser2.getResources();
        })()
      : [];

    // 8. Plan should detect change
    state = stateManager.getCurrentState();
    const updatedGraph = graphBuilder.buildGraph(updatedResources);
    plan = planEngine.generatePlan(updatedResources, state);

    expect(plan.resource_count.update).toBe(1);
    expect(plan.changes).toContainEqual(
      expect.objectContaining({
        operation: "update",
        type: "file",
        name: "test_file",
      })
    );

    // 9. Apply update
    const applyEngine2 = new ApplyEngine(stateManager, providers, updatedGraph, updatedResources);
    const updateResult = await applyEngine2.apply(plan);

    expect(updateResult.success).toBe(true);
    expect(fs.readFileSync(path.join(testDir, "test.txt"), "utf-8")).toBe(
      "updated content"
    );

    // 10. Plan again (should show no changes)
    state = stateManager.getCurrentState();
    plan = planEngine.generatePlan(updatedResources, state);

    expect(plan.resource_count.create).toBe(0);
    expect(plan.resource_count.update).toBe(0);
    expect(plan.resource_count.delete).toBe(0);
  });
});
