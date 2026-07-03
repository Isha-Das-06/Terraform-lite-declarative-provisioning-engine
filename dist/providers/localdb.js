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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalDBProvider = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const sql_js_1 = __importDefault(require("sql.js"));
const base_1 = require("./base");
const logger_1 = require("../utils/logger");
let dbInitPromise = null;
async function initSQL() {
    if (!dbInitPromise) {
        dbInitPromise = (0, sql_js_1.default)();
    }
    return dbInitPromise;
}
class LocalDBProvider extends base_1.BaseProvider {
    constructor() {
        super(...arguments);
        this.name = "localdb";
        this.supportedTypes = ["sqlite_database", "sqlite_table"];
        this.databases = new Map();
        this.dbPaths = new Map();
    }
    async create(resourceName, attributes) {
        const type = attributes.type || attributes.resource_type;
        if (type === "database") {
            return this.createDatabase(resourceName, attributes);
        }
        else if (type === "table") {
            return this.createTable(resourceName, attributes);
        }
        throw new Error(`Unsupported localdb resource type: ${type}`);
    }
    async createDatabase(resourceName, attributes) {
        await initSQL();
        const dbPath = attributes.path || attributes.filename || `:memory:`;
        const dbId = this.generateId("db");
        try {
            let db;
            if (dbPath === ":memory:") {
                db = new (await initSQL()).Database();
            }
            else {
                const dir = path.dirname(dbPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                if (fs.existsSync(dbPath)) {
                    const data = fs.readFileSync(dbPath);
                    db = new (await initSQL()).Database(data);
                }
                else {
                    db = new (await initSQL()).Database();
                    const data = db.export();
                    fs.writeFileSync(dbPath, Buffer.from(data));
                }
            }
            this.databases.set(dbId, db);
            this.dbPaths.set(dbId, dbPath);
            logger_1.logger.debug(`SQLite database created: ${dbPath}`);
            return {
                type: "sqlite_database",
                name: resourceName,
                id: dbId,
                attributes: {
                    path: dbPath,
                },
                timestamp: Date.now(),
            };
        }
        catch (error) {
            throw new Error(`Failed to create database: ${error.message}`);
        }
    }
    async createTable(resourceName, attributes) {
        const dbId = attributes.database_id || attributes.database;
        const tableName = attributes.name || attributes.table_name || resourceName;
        const columns = attributes.columns || [];
        if (!dbId) {
            throw new Error("Table requires 'database_id' or 'database' attribute");
        }
        const db = this.databases.get(dbId);
        if (!db) {
            throw new Error(`Database not found: ${dbId}`);
        }
        try {
            if (columns.length === 0) {
                throw new Error("Table requires 'columns' definition");
            }
            const columnDefs = this.buildColumnDefinitions(columns);
            const createTableSql = `CREATE TABLE IF NOT EXISTS ${tableName} (${columnDefs})`;
            db.run(createTableSql);
            const dbPath = this.dbPaths.get(dbId);
            if (dbPath && dbPath !== ":memory:") {
                const data = db.export();
                fs.writeFileSync(dbPath, Buffer.from(data));
            }
            const tableId = this.generateId("table");
            logger_1.logger.debug(`Table created: ${tableName}`);
            return {
                type: "sqlite_table",
                name: resourceName,
                id: tableId,
                attributes: {
                    table_name: tableName,
                    database_id: dbId,
                    columns: columns.length,
                },
                timestamp: Date.now(),
            };
        }
        catch (error) {
            throw new Error(`Failed to create table: ${error.message}`);
        }
    }
    buildColumnDefinitions(columns) {
        return columns
            .map((col) => {
            let def = `${col.name} ${col.type}`;
            if (col.constraints && col.constraints.length > 0) {
                def += ` ${col.constraints.join(" ")}`;
            }
            return def;
        })
            .join(", ");
    }
    async read(id) {
        return null;
    }
    async update(id, resourceName, attributes, resourceType) {
        return {
            type: "sqlite_table",
            name: resourceName,
            id,
            attributes,
            timestamp: Date.now(),
        };
    }
    async delete(id, attributes) {
        if (!attributes || !attributes.database_id) {
            return;
        }
        const db = this.databases.get(attributes.database_id);
        if (!db) {
            return;
        }
        try {
            if (attributes.table_name) {
                db.run(`DROP TABLE IF EXISTS ${attributes.table_name}`);
                const dbPath = this.dbPaths.get(attributes.database_id);
                if (dbPath && dbPath !== ":memory:") {
                    const data = db.export();
                    fs.writeFileSync(dbPath, Buffer.from(data));
                }
                logger_1.logger.debug(`Table deleted: ${attributes.table_name}`);
            }
        }
        catch (error) {
            logger_1.logger.warn(`Failed to delete table: ${error.message}`);
        }
    }
    async exists(id) {
        return true;
    }
}
exports.LocalDBProvider = LocalDBProvider;
//# sourceMappingURL=localdb.js.map