declare module "sql.js" {
  interface Database {
    run(sql: string): void;
    export(): Uint8Array;
    close(): void;
  }

  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database;
  }

  function initSqlJs(
    config?: any
  ): Promise<SqlJsStatic>;

  export default initSqlJs;
}
