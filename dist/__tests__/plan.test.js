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
const plan_1 = require("../engine/plan");
const manager_1 = require("../state/manager");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
describe("PlanEngine", () => {
    let planEngine;
    let stateManager;
    const testStateFile = path.join(__dirname, "test-state.tfstate");
    beforeEach(() => {
        if (fs.existsSync(testStateFile)) {
            fs.unlinkSync(testStateFile);
        }
        stateManager = new manager_1.StateManager(testStateFile);
        planEngine = new plan_1.PlanEngine(stateManager);
    });
    afterEach(() => {
        if (fs.existsSync(testStateFile)) {
            fs.unlinkSync(testStateFile);
        }
    });
    describe("Idempotency", () => {
        test("plan with no changes reports 0 changes", () => {
            const state = {
                version: 4,
                terraform_version: "1.0.0",
                serial: 1,
                lineage: "test",
                resources: [
                    {
                        type: "file",
                        name: "test",
                        id: "file-123",
                        attributes: {
                            path: "./test.txt",
                            content_hash: "2cf24dba",
                            size: 5,
                        },
                        timestamp: Date.now(),
                    },
                ],
                checkpoints: [],
            };
            const resources = [
                {
                    type: "file",
                    name: "test",
                    attributes: {
                        type: "file",
                        path: "./test.txt",
                        content: "hello",
                    },
                },
            ];
            const plan = planEngine.generatePlan(resources, state);
            expect(plan.resource_count.create).toBe(0);
            expect(plan.resource_count.update).toBe(0);
            expect(plan.resource_count.delete).toBe(0);
            expect(plan.changes.every((c) => c.operation === "no-op")).toBe(true);
        });
    });
    describe("Change Detection", () => {
        test("detects content changes", () => {
            const state = {
                version: 4,
                terraform_version: "1.0.0",
                serial: 1,
                lineage: "test",
                resources: [
                    {
                        type: "file",
                        name: "config",
                        id: "file-123",
                        attributes: {
                            path: "./config.txt",
                            content_hash: "2cf24dba",
                            size: 5,
                        },
                        timestamp: Date.now(),
                    },
                ],
                checkpoints: [],
            };
            const resources = [
                {
                    type: "file",
                    name: "config",
                    attributes: {
                        type: "file",
                        path: "./config.txt",
                        content: "world",
                    },
                },
            ];
            const plan = planEngine.generatePlan(resources, state);
            expect(plan.resource_count.update).toBe(1);
            expect(plan.changes).toContainEqual(expect.objectContaining({
                operation: "update",
                type: "file",
                name: "config",
            }));
        });
        test("detects template variable changes", () => {
            const state = {
                version: 4,
                terraform_version: "1.0.0",
                serial: 1,
                lineage: "test",
                resources: [
                    {
                        type: "template",
                        name: "env",
                        id: "template-123",
                        attributes: {
                            path: "./.env",
                            content_hash: "c5c0b4ca",
                        },
                        timestamp: Date.now(),
                    },
                ],
                checkpoints: [],
            };
            const resources = [
                {
                    type: "template",
                    name: "env",
                    attributes: {
                        type: "template",
                        path: "./.env",
                        template: "DEBUG=${debug}",
                        variables: {
                            debug: "true",
                        },
                    },
                },
            ];
            const plan = planEngine.generatePlan(resources, state);
            expect(plan.resource_count.update).toBe(1);
            expect(plan.changes).toContainEqual(expect.objectContaining({
                operation: "update",
                type: "template",
                name: "env",
            }));
        });
        test("detects permission changes", () => {
            const state = {
                version: 4,
                terraform_version: "1.0.0",
                serial: 1,
                lineage: "test",
                resources: [
                    {
                        type: "file",
                        name: "script",
                        id: "file-456",
                        attributes: {
                            path: "./script.sh",
                            content_hash: "abc12345",
                            permissions: "0644",
                            size: 100,
                        },
                        timestamp: Date.now(),
                    },
                ],
                checkpoints: [],
            };
            const resources = [
                {
                    type: "file",
                    name: "script",
                    attributes: {
                        type: "file",
                        path: "./script.sh",
                        content: "#!/bin/bash\necho hello",
                        permissions: "0755",
                    },
                },
            ];
            const plan = planEngine.generatePlan(resources, state);
            expect(plan.resource_count.update).toBe(1);
            expect(plan.changes[0].operation).toBe("update");
        });
    });
    describe("Create / Delete", () => {
        test("detects new resources", () => {
            const state = {
                version: 4,
                terraform_version: "1.0.0",
                serial: 1,
                lineage: "test",
                resources: [],
                checkpoints: [],
            };
            const resources = [
                {
                    type: "file",
                    name: "new",
                    attributes: {
                        type: "file",
                        path: "./new.txt",
                        content: "new file",
                    },
                },
            ];
            const plan = planEngine.generatePlan(resources, state);
            expect(plan.resource_count.create).toBe(1);
            expect(plan.changes[0].operation).toBe("create");
        });
        test("detects removed resources", () => {
            const state = {
                version: 4,
                terraform_version: "1.0.0",
                serial: 1,
                lineage: "test",
                resources: [
                    {
                        type: "file",
                        name: "old",
                        id: "file-999",
                        attributes: {
                            path: "./old.txt",
                            content_hash: "xyz",
                            size: 10,
                        },
                        timestamp: Date.now(),
                    },
                ],
                checkpoints: [],
            };
            const resources = [];
            const plan = planEngine.generatePlan(resources, state);
            expect(plan.resource_count.delete).toBe(1);
            expect(plan.changes[0].operation).toBe("delete");
        });
    });
    describe("Attribute Normalization", () => {
        test("normalizes content to content_hash", () => {
            const state = {
                version: 4,
                terraform_version: "1.0.0",
                serial: 1,
                lineage: "test",
                resources: [
                    {
                        type: "file",
                        name: "test",
                        id: "file-123",
                        attributes: {
                            path: "./test.txt",
                            content_hash: "2cf24dba",
                            size: 5,
                        },
                        timestamp: Date.now(),
                    },
                ],
                checkpoints: [],
            };
            const resources = [
                {
                    type: "file",
                    name: "test",
                    attributes: {
                        type: "file",
                        path: "./test.txt",
                        content: "hello",
                    },
                },
            ];
            const plan = planEngine.generatePlan(resources, state);
            expect(plan.changes[0].operation).toBe("no-op");
        });
    });
});
//# sourceMappingURL=plan.test.js.map