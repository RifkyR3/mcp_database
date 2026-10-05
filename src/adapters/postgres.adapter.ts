import pg from 'pg';
import { performance } from 'node:perf_hooks';
import { ColumnInfo, MainConnectionConfig, QueryResult, TableInfo } from '../config/types.js';
import { DatabaseAdapter } from './adapter.interface.js';

const { Pool } = pg;

export class PostgresAdapter implements DatabaseAdapter {
  private pool: pg.Pool;
  private databaseName: string;

  constructor(mainConfig: MainConnectionConfig, database: string) {
    this.databaseName = database;
    this.pool = new Pool({
      host: mainConfig.host,
      port: mainConfig.port || 5432,
      user: mainConfig.user,
      password: mainConfig.password,
      database: database,
      ssl: mainConfig.ssl ? (typeof mainConfig.ssl === 'object' ? mainConfig.ssl : { rejectUnauthorized: false }) : undefined,
      max: mainConfig.maxConnections || 10,
      idleTimeoutMillis: mainConfig.idleTimeoutMillis || 30000,
    });
  }

  async connect(): Promise<void> {
    const client = await this.pool.connect();
    client.release();
  }

  async query(sql: string, params?: unknown[]): Promise<QueryResult> {
    const start = performance.now();
    const result = await this.pool.query(sql, params);
    const duration = Math.round((performance.now() - start) * 100) / 100;

    return {
      rows: result.rows || [],
      rowCount: result.rowCount ?? (result.rows ? result.rows.length : 0),
      fields: result.fields?.map((f) => ({
        name: f.name,
        type: String(f.dataTypeID),
      })),
      executionTimeMs: duration,
    };
  }

  async listDatabases(): Promise<string[]> {
    const res = await this.query(
      `SELECT datname FROM pg_database WHERE datistemplate = false AND has_database_privilege(datname, 'CONNECT') ORDER BY datname;`
    );
    return res.rows.map((r) => String(r.datname));
  }

  async listTables(schema?: string): Promise<TableInfo[]> {
    let sql = `
      SELECT 
        table_name AS "tableName",
        table_type AS "tableType",
        table_schema AS "schema"
      FROM information_schema.tables 
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    `;
    const params: unknown[] = [];
    if (schema) {
      params.push(schema);
      sql += ` AND table_schema = $1`;
    }
    sql += ` ORDER BY table_schema, table_name;`;

    const res = await this.query(sql, params);
    return res.rows.map((r) => ({
      tableName: String(r.tableName),
      tableType: String(r.tableType),
      schema: String(r.schema),
    }));
  }

  async describeTable(tableName: string, schema?: string): Promise<ColumnInfo[]> {
    let sql = `
      SELECT 
        c.column_name AS "columnName",
        c.data_type AS "dataType",
        (c.is_nullable = 'YES') AS "isNullable",
        c.column_default AS "columnDefault",
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS "isPrimaryKey"
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT kcu.table_schema, kcu.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name 
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
      ) pk ON c.table_schema = pk.table_schema 
          AND c.table_name = pk.table_name 
          AND c.column_name = pk.column_name
      WHERE c.table_name = $1
    `;

    const params: unknown[] = [tableName];
    if (schema) {
      params.push(schema);
      sql += ` AND c.table_schema = $2`;
    } else {
      sql += ` AND c.table_schema NOT IN ('pg_catalog', 'information_schema')`;
    }

    sql += ` ORDER BY c.ordinal_position;`;

    const res = await this.query(sql, params);
    return res.rows.map((r) => ({
      columnName: String(r.columnName),
      dataType: String(r.dataType),
      isNullable: Boolean(r.isNullable),
      columnDefault: r.columnDefault != null ? String(r.columnDefault) : null,
      isPrimaryKey: Boolean(r.isPrimaryKey),
    }));
  }

  async testConnection(): Promise<{ ok: boolean; message: string; version?: string }> {
    try {
      const res = await this.query('SELECT version();');
      const version = res.rows[0]?.version ? String(res.rows[0].version) : 'Unknown PostgreSQL Version';
      return {
        ok: true,
        message: `Successfully connected to PostgreSQL database "${this.databaseName}"`,
        version,
      };
    } catch (err: any) {
      return {
        ok: false,
        message: `Connection to "${this.databaseName}" failed: ${err.message}`,
      };
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
