import { PlanEngine } from "../engine/plan";
import { StateManager } from "../state/manager";
import { State, Resource } from "../types";
import * as fs from "fs";
import * as path from "path";

describe("PlanEngine", () => {
  let planEngine: PlanEngine;
  let stateManager: StateManager;
  const testStateFile = path.join(__dirname, "test-state.tfstate");

  beforeEach(() => {
    // Clean up any previous test state
    if (fs.existsSync(testStateFile)) {
      fs.unlinkSync(testStateFile);
    }
    stateManager = new StateManager(testStateFile);
    planEngine = new PlanEngine(stateManager);
  });

  afterEach(() => {
    // Clean up test state
    if (fs.existsSync(testStateFile)) {
      fs.unlinkSync(testStateFile);
    }
  });

  describe("Idempotency", () => {
    test("plan with no changes reports 0 changes", () => {
      const state: State = {
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

      const resources: Resource[] = [
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
      const state: State = {
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
              content_hash: "2cf24dba", // hash of "hello"
              size: 5,
            },
            timestamp: Date.now(),
          },
        ],
        checkpoints: [],
      };

      const resources: Resource[] = [
        {
          type: "file",
          name: "config",
          attributes: {
            type: "file",
            path: "./config.txt",
            content: "world", // Different content
          },
        },
      ];

      const plan = planEngine.generatePlan(resources, state);

      expect(plan.resource_count.update).toBe(1);
      expect(plan.changes).toContainEqual(
        expect.objectContaining({
          operation: "update",
          type: "file",
          name: "config",
        })
      );
    });

    test("detects template variable changes", () => {
      const state: State = {
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
              content_hash: "c5c0b4ca", // hash of "DEBUG=false"
            },
            timestamp: Date.now(),
          },
        ],
        checkpoints: [],
      };

      const resources: Resource[] = [
        {
          type: "template",
          name: "env",
          attributes: {
            type: "template",
            path: "./.env",
            template: "DEBUG=${debug}",
            variables: {
              debug: "true", // Changed from "false"
            },
          },
        },
      ];

      const plan = planEngine.generatePlan(resources, state);

      expect(plan.resource_count.update).toBe(1);
      expect(plan.changes).toContainEqual(
        expect.objectContaining({
          operation: "update",
          type: "template",
          name: "env",
        })
      );
    });

    test("detects permission changes", () => {
      const state: State = {
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

      const resources: Resource[] = [
        {
          type: "file",
          name: "script",
          attributes: {
            type: "file",
            path: "./script.sh",
            content: "#!/bin/bash\necho hello",
            permissions: "0755", // Changed from 0644
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
      const state: State = {
        version: 4,
        terraform_version: "1.0.0",
        serial: 1,
        lineage: "test",
        resources: [],
        checkpoints: [],
      };

      const resources: Resource[] = [
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
      const state: State = {
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

      const resources: Resource[] = []; // No resources

      const plan = planEngine.generatePlan(resources, state);

      expect(plan.resource_count.delete).toBe(1);
      expect(plan.changes[0].operation).toBe("delete");
    });
  });

  describe("Attribute Normalization", () => {
    test("normalizes content to content_hash", () => {
      const state: State = {
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
              content_hash: "2cf24dba", // hash of "hello"
              size: 5,
            },
            timestamp: Date.now(),
          },
        ],
        checkpoints: [],
      };

      const resources: Resource[] = [
        {
          type: "file",
          name: "test",
          attributes: {
            type: "file",
            path: "./test.txt",
            content: "hello", // Should match the state hash
          },
        },
      ];

      const plan = planEngine.generatePlan(resources, state);

      // Should be no-op since hash matches
      expect(plan.changes[0].operation).toBe("no-op");
    });
  });
});
