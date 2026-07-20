import * as fs from "fs";
import * as path from "path";
import initSqlJs from "sql.js";
import { BaseProvider } from "./base";
import { ResourceState } from "../types";
import { logger } from "../utils/logger";

type SqlJsDatabase = any;

let dbInitPromise: Promise<any> | null = null;

async function initSQL() {
  if (!dbInitPromise) {
    dbInitPromise = initSqlJs();
  }
  return dbInitPromise;
}

export class LocalDBProvider extends BaseProvider {
  name = "localdb";
  supportedTypes = ["sqlite_database", "sqlite_table"];
  private databases: Map<string, SqlJsDatabase> = new Map();
  private dbPaths: Map<string, string> = new Map();

  async create(
    resourceName: string,
    attributes: Record<string, any>
  ): Promise<ResourceState> {
    const type = attributes.type || attributes.resource_type;

    if (type === "database") {
      return this.createDatabase(resourceName, attributes);
    } else if (type === "table") {
      return this.createTable(resourceName, attributes);
    }

    throw new Error(`Unsupported localdb resource type: ${type}`);
  }

  private async createDatabase(
    resourceName: string,
    attributes: Record<string, any>
  ): Promise<ResourceState> {
    await initSQL();

    const dbPath = attributes.path || attributes.filename || `:memory:`;
    const dbId = this.generateId("db");

    try {
      let db: SqlJsDatabase;

      if (dbPath === ":memory:") {
        db = new (await initSQL()).Database();
      } else {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        if (fs.existsSync(dbPath)) {
          const data = fs.readFileSync(dbPath);
          db = new (await initSQL()).Database(data);
        } else {
          db = new (await initSQL()).Database();
          const data = db.export();
          fs.writeFileSync(dbPath, Buffer.from(data));
        }
      }

      this.databases.set(dbId, db);
      this.dbPaths.set(dbId, dbPath);

      // Also register under the resource reference so tables can point at
      // "sqlite_database.<name>" in their database_id attribute
      const resourceRef = `sqlite_database.${resourceName}`;
      this.databases.set(resourceRef, db);
      this.dbPaths.set(resourceRef, dbPath);

      logger.debug(`SQLite database created: ${dbPath}`);

      return {
        type: "sqlite_database",
        name: resourceName,
        id: dbId,
        attributes: {
          path: dbPath,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      throw new Error(`Failed to create database: ${(error as Error).message}`);
    }
  }

  private async createTable(
    resourceName: string,
    attributes: Record<string, any>
  ): Promise<ResourceState> {
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

      logger.debug(`Table created: ${tableName}`);

      return {
        type: "sqlite_table",
        name: resourceName,
        id: tableId,
        attributes: {
          name: tableName,
          table_name: tableName,
          database_id: dbId,
          columns,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      throw new Error(`Failed to create table: ${(error as Error).message}`);
    }
  }

  private buildColumnDefinitions(
    columns: Array<{ name: string; type: string; constraints?: string[] }>
  ): string {
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

  async read(id: string): Promise<ResourceState | null> {
    return null;
  }

  async update(
    id: string,
    resourceName: string,
    attributes: Record<string, any>,
    resourceType?: string
  ): Promise<ResourceState> {
    return {
      type: resourceType || "sqlite_table",
      name: resourceName,
      id,
      attributes,
      timestamp: Date.now(),
    };
  }

  async delete(id: string, attributes?: Record<string, any>): Promise<void> {
    if (!attributes) {
      return;
    }

    // Database resource: close handle and remove the db file
    if (!attributes.database_id) {
      if (attributes.path && attributes.path !== ":memory:" && fs.existsSync(attributes.path)) {
        fs.unlinkSync(attributes.path);
        logger.debug(`Database deleted: ${attributes.path}`);
      }
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

        logger.debug(`Table deleted: ${attributes.table_name}`);
      }
    } catch (error) {
      logger.warn(`Failed to delete table: ${(error as Error).message}`);
    }
  }

  async exists(id: string): Promise<boolean> {
    return true;
  }
}
