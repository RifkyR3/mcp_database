export type DatabaseEngine = 'postgres' | 'mysql';

export interface WriteRuleConfig {
  /** Whether write/mutation queries are allowed. Default: true */
  allow?: boolean;
  /**
   * Exceptions to the allow rule.
   * - If allow === false: SQL operations that ARE allowed (e.g. ["INSERT", "UPDATE"])
   * - If allow === true: SQL operations that ARE forbidden (e.g. ["DROP", "TRUNCATE"])
   */
  exceptions?: string[];
}

export interface SubConnectionConfig {
  /** Unique identifier for the sub-connection (alias), e.g. "sales_db" */
  id: string;
  /** Name of the database on the main server */
  database: string;
  /** Optional description */
  description?: string;
  /** Legacy read-only flag */
  readOnly?: boolean;
  /** Structured write rule */
  writeRule?: WriteRuleConfig;
  /** Allow write shortcut (e.g. allowWrite: false) */
  allowWrite?: boolean;
  /** Write exceptions shortcut (e.g. writeExceptions: ["INSERT", "UPDATE"]) */
  writeExceptions?: string[];
}

export interface MainConnectionConfig {
  /** Unique identifier for the main connection, e.g. "pg_local" or "mysql_cluster" */
  id: string;
  /** Engine type: 'postgres' | 'mysql' */
  engine: DatabaseEngine;
  /** Database server host or IP */
  host: string;
  /** Database server port (default: 5432 for postgres, 3306 for mysql) */
  port?: number;
  /** Username */
  user: string;
  /** Password */
  password?: string;
  /** Default database used for metadata/admin connection (e.g. "postgres" or "mysql") */
  defaultDatabase?: string;
  /** SSL configuration */
  ssl?: boolean | Record<string, unknown>;
  /** Max pool connections per database (default: 10) */
  maxConnections?: number;
  /** Idle timeout in milliseconds (default: 30000) */
  idleTimeoutMillis?: number;
  /** Structured write rule for all sub-connections under this main */
  writeRule?: WriteRuleConfig;
  /** Allow write shortcut */
  allowWrite?: boolean;
  /** Write exceptions shortcut */
  writeExceptions?: string[];
  /** Optional pre-configured sub-connections */
  subConnections?: SubConnectionConfig[];
  /** Optional description */
  description?: string;
}

export interface AppConfig {
  connections: Record<string, MainConnectionConfig>;
}

export interface ResolvedTarget {
  mainId: string;
  mainConfig: MainConnectionConfig;
  database: string;
  subConnectionId?: string;
  subConfig?: SubConnectionConfig;
  effectiveWriteRule: WriteRuleConfig;
  readOnly?: boolean;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  fields?: { name: string; type?: string }[];
  executionTimeMs: number;
}

export interface TableInfo {
  tableName: string;
  tableType: 'BASE TABLE' | 'VIEW' | string;
  schema?: string;
  estimatedRows?: number;
}

export interface ColumnInfo {
  columnName: string;
  dataType: string;
  isNullable: boolean;
  columnDefault?: string | null;
  isPrimaryKey?: boolean;
  comment?: string | null;
}
