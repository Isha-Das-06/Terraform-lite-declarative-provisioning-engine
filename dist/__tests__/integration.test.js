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
const path = __importStar(require("path"));
const manager_1 = require("../state/manager");
const parser_1 = require("../config/parser");
const plan_1 = require("../engine/plan");
const apply_1 = require("../engine/apply");
const builder_1 = require("../graph/builder");
const filesystem_1 = require("../providers/filesystem");
describe("Terraform-Lite Integration", () => {
    const testDir = path.join(__dirname, "test-integration");
    const configFile = path.join(testDir, "test.tf.json");
    const stateFile = path.join(testDir, "terraform.tfstate");
    beforeEach(() => {
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
    });
    afterEach(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });
    test("full workflow: init → plan → apply → plan → destroy", async () => {
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
        const stateManager = new manager_1.StateManager(testDir);
        stateManager.loadState();
        const parser = new parser_1.ConfigParser();
        const parsedConfig = parser.loadConfig(configFile);
        const resources = parser.getResources();
        const graphBuilder = new builder_1.DependencyGraphBuilder();
        const graph = graphBuilder.buildGraph(resources);
        const planEngine = new plan_1.PlanEngine(stateManager);
        let state = stateManager.getCurrentState();
        let plan = planEngine.generatePlan(resources, state);
        expect(plan.resource_count.create).toBe(2);
        expect(plan.resource_count.update).toBe(0);
        expect(plan.resource_count.delete).toBe(0);
        const provider = new filesystem_1.FilesystemProvider();
        const providers = new Map([["file", provider], ["directory", provider]]);
        const applyEngine = new apply_1.ApplyEngine(stateManager, providers, graph, resources);
        const applyResult = await applyEngine.apply(plan);
        expect(applyResult.success).toBe(true);
        expect(applyResult.resources_created).toContain("directory.test_dir");
        expect(applyResult.resources_created).toContain("file.test_file");
        expect(fs.existsSync(path.join(testDir, "data"))).toBe(true);
        expect(fs.existsSync(path.join(testDir, "test.txt"))).toBe(true);
        expect(fs.readFileSync(path.join(testDir, "test.txt"), "utf-8")).toBe("initial content");
        state = stateManager.getCurrentState();
        plan = planEngine.generatePlan(resources, state);
        expect(plan.resource_count.create).toBe(0);
        expect(plan.resource_count.update).toBe(0);
        expect(plan.resource_count.delete).toBe(0);
        config.resource.file.test_file.content = "updated content";
        fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
        const updatedResources = new parser_1.ConfigParser().loadConfig(configFile).resource
            ? (() => {
                const parser2 = new parser_1.ConfigParser();
                parser2.loadConfig(configFile);
                return parser2.getResources();
            })()
            : [];
        state = stateManager.getCurrentState();
        const updatedGraph = graphBuilder.buildGraph(updatedResources);
        plan = planEngine.generatePlan(updatedResources, state);
        expect(plan.resource_count.update).toBe(1);
        expect(plan.changes).toContainEqual(expect.objectContaining({
            operation: "update",
            type: "file",
            name: "test_file",
        }));
        const applyEngine2 = new apply_1.ApplyEngine(stateManager, providers, updatedGraph, updatedResources);
        const updateResult = await applyEngine2.apply(plan);
        expect(updateResult.success).toBe(true);
        expect(fs.readFileSync(path.join(testDir, "test.txt"), "utf-8")).toBe("updated content");
        state = stateManager.getCurrentState();
        plan = planEngine.generatePlan(updatedResources, state);
        expect(plan.resource_count.create).toBe(0);
        expect(plan.resource_count.update).toBe(0);
        expect(plan.resource_count.delete).toBe(0);
    });
});
//# sourceMappingURL=integration.test.js.map