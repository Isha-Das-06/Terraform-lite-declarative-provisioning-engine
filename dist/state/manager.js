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
exports.StateManager = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger_1 = require("../utils/logger");
class StateManager {
    constructor(workingDir = ".") {
        this.state = null;
        this.locked = false;
        this.statePath = path.join(workingDir, "terraform.tfstate");
        this.lockPath = path.join(workingDir, "terraform.tfstate.lock");
    }
    lock() {
        if (this.locked) {
            throw new Error("State is already locked");
        }
        fs.writeFileSync(this.lockPath, JSON.stringify({ locked_at: new Date() }));
        this.locked = true;
        logger_1.logger.debug("State locked");
    }
    unlock() {
        if (fs.existsSync(this.lockPath)) {
            fs.unlinkSync(this.lockPath);
        }
        this.locked = false;
        logger_1.logger.debug("State unlocked");
    }
    loadState() {
        if (this.state) {
            return this.state;
        }
        if (!fs.existsSync(this.statePath)) {
            logger_1.logger.debug("No existing state file, creating new state");
            return this.createNewState();
        }
        const content = fs.readFileSync(this.statePath, "utf-8");
        this.state = JSON.parse(content);
        logger_1.logger.debug(`State loaded with ${this.state.resources.length} resources`);
        return this.state;
    }
    createNewState() {
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
    generateLineage() {
        return Math.random().toString(36).substring(2, 15);
    }
    saveState(state) {
        if (!this.locked) {
            logger_1.logger.warn("State not locked, acquiring lock before save");
            this.lock();
        }
        state.serial = (state.serial || 0) + 1;
        this.state = state;
        fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2));
        logger_1.logger.debug(`State saved with serial ${state.serial}`);
    }
    createCheckpoint(description = "") {
        if (!this.state) {
            throw new Error("State not loaded");
        }
        const checkpoint = {
            serial: this.state.serial,
            resources: JSON.parse(JSON.stringify(this.state.resources)),
            timestamp: Date.now(),
            description,
        };
        this.state.checkpoints.push(checkpoint);
        if (this.state.checkpoints.length > 10) {
            this.state.checkpoints = this.state.checkpoints.slice(-10);
        }
        logger_1.logger.debug(`Checkpoint created: ${description}`);
    }
    rollbackToLastCheckpoint() {
        if (!this.state || this.state.checkpoints.length === 0) {
            throw new Error("No checkpoints available for rollback");
        }
        const checkpoint = this.state.checkpoints[this.state.checkpoints.length - 1];
        this.state.resources = JSON.parse(JSON.stringify(checkpoint.resources));
        this.state.checkpoints.pop();
        this.saveState(this.state);
        logger_1.logger.success(`Rolled back to checkpoint: ${checkpoint.description}`);
        return this.state;
    }
    addResource(resource) {
        if (!this.state) {
            throw new Error("State not loaded");
        }
        const existing = this.state.resources.findIndex((r) => r.type === resource.type && r.name === resource.name);
        if (existing >= 0) {
            this.state.resources[existing] = resource;
        }
        else {
            this.state.resources.push(resource);
        }
    }
    removeResource(type, name) {
        if (!this.state) {
            throw new Error("State not loaded");
        }
        this.state.resources = this.state.resources.filter((r) => !(r.type === type && r.name === name));
    }
    getResource(type, name) {
        if (!this.state) {
            return undefined;
        }
        return this.state.resources.find((r) => r.type === type && r.name === name);
    }
    getAllResources() {
        if (!this.state) {
            return [];
        }
        return this.state.resources;
    }
    getCurrentState() {
        if (!this.state) {
            return this.loadState();
        }
        return this.state;
    }
    stateFileExists() {
        return fs.existsSync(this.statePath);
    }
    deleteStateFile() {
        if (fs.existsSync(this.statePath)) {
            fs.unlinkSync(this.statePath);
        }
        if (fs.existsSync(this.lockPath)) {
            fs.unlinkSync(this.lockPath);
        }
        this.state = null;
        logger_1.logger.debug("State files deleted");
    }
}
exports.StateManager = StateManager;
//# sourceMappingURL=manager.js.map