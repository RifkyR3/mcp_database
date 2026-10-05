import { ColumnInfo, QueryResult, TableInfo } from '../config/types.js';

export interface DatabaseAdapter {
  /**
   * Initializes or verifies the connection pool
   */
  connect(): Promise<void>;

  /**
   * Executes an arbitrary SQL query with optional parameterized values
   */
  query(sql: string, params?: unknown[]): Promise<QueryResult>;

  /**
   * Discovers and lists all databases available on this server
   */
  listDatabases(): Promise<string[]>;

  /**
   * Lists all tables and views in the current database
   */
  listTables(schema?: string): Promise<TableInfo[]>;

  /**
   * Returns schema information (columns, types, nullability, keys) for a specific table
   */
  describeTable(tableName: string, schema?: string): Promise<ColumnInfo[]>;

  /**
   * Tests the connection and returns server version information
   */
  testConnection(): Promise<{ ok: boolean; message: string; version?: string }>;

  /**
   * Closes the connection pool and cleans up resources
   */
  close(): Promise<void>;
}
