import mysql, { Pool, RowDataPacket, FieldPacket, ResultSetHeader } from 'mysql2/promise';
import { performance } from 'node:perf_hooks';
import { ColumnInfo, MainConnectionConfig, QueryResult, TableInfo } from '../config/types.js';
import { DatabaseAdapter } from './adapter.interface.js';

export class MysqlAdapter implements DatabaseAdapter {
  private pool: Pool;
  private databaseName: string;

  constructor(mainConfig: MainConnectionConfig, database: string) {
    this.databaseName = database;
    this.pool = mysql.createPool({
      host: mainConfig.host,
      port: mainConfig.port || 3306,
      user: mainConfig.user,
      password: mainConfig.password,
      database: database,
      ssl: mainConfig.ssl ? (typeof mainConfig.ssl === 'object' ? (mainConfig.ssl as any) : { rejectUnauthorized: false }) : undefined,
      connectionLimit: mainConfig.maxConnections || 10,
      waitForConnections: true,
      queueLimit: 0,
    });
  }

  async connect(): Promise<void> {
    const conn = await this.pool.getConnection();
    conn.release();
  }

  async query(sql: string, params?: unknown[]): Promise<QueryResult> {
    const start = performance.now();
    const [rawRows, rawFields] = await this.pool.query(sql, params as any);
    const duration = Math.round((performance.now() - start) * 100) / 100;

    let rows: Record<string, unknown>[] = [];
    let rowCount = 0;

    if (Array.isArray(rawRows)) {
      rows = rawRows as Record<string, unknown>[];
      rowCount = rows.length;
    } else if (rawRows && typeof rawRows === 'object') {
      const header = rawRows as ResultSetHeader;
      rowCount = header.affectedRows ?? 0;
    }

    const fields = rawFields
      ? (rawFields as FieldPacket[]).map((f) => ({
          name: f.name,
          type: String(f.type),
        }))
      : undefined;

    return {
      rows,
      rowCount,
      fields,
      executionTimeMs: duration,
    };
  }

  async listDatabases(): Promise<string[]> {
    const res = await this.query('SHOW DATABASES;');
    return res.rows
      .map((r) => {
        const val = r.Database || r.database || Object.values(r)[0];
        return val ? String(val) : '';
      })
      .filter(Boolean);
  }

  async listTables(schema?: string): Promise<TableInfo[]> {
    const targetSchema = schema || this.databaseName;
    const sql = `
      SELECT 
        table_name AS tableName,
        table_type AS tableType,
        table_schema AS \`schema\`
      FROM information_schema.tables
      WHERE table_schema = ?
      ORDER BY table_name;
    `;

    const res = await this.query(sql, [targetSchema]);
    return res.rows.map((r) => ({
      tableName: String(r.tableName),
      tableType: String(r.tableType),
      schema: String(r.schema),
    }));
  }

  async describeTable(tableName: string, schema?: string): Promise<ColumnInfo[]> {
    const targetSchema = schema || this.databaseName;
    const sql = `
      SELECT 
        column_name AS columnName,
        column_type AS dataType,
        (is_nullable = 'YES') AS isNullable,
        column_default AS columnDefault,
        (column_key = 'PRI') AS isPrimaryKey,
        column_comment AS comment
      FROM information_schema.columns
      WHERE table_schema = ? AND table_name = ?
      ORDER BY ordinal_position;
    `;

    const res = await this.query(sql, [targetSchema, tableName]);
    return res.rows.map((r) => ({
      columnName: String(r.columnName),
      dataType: String(r.dataType),
      isNullable: Boolean(Number(r.isNullable) || r.isNullable === 'YES' || r.isNullable === true),
      columnDefault: r.columnDefault != null ? String(r.columnDefault) : null,
      isPrimaryKey: Boolean(Number(r.isPrimaryKey) || r.isPrimaryKey === 'PRI' || r.isPrimaryKey === true),
      comment: r.comment ? String(r.comment) : null,
    }));
  }

  async testConnection(): Promise<{ ok: boolean; message: string; version?: string }> {
    try {
      const res = await this.query('SELECT VERSION() AS version;');
      const version = res.rows[0]?.version ? String(res.rows[0].version) : 'Unknown MySQL Version';
      return {
        ok: true,
        message: `Successfully connected to MySQL database "${this.databaseName}"`,
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
