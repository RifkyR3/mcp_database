import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ConnectionManager } from '../manager/connection-manager.js';
import { saveConfigFile } from '../config/config.js';
import { validateQueryAgainstWriteRule } from '../security/write-rules.js';

export function registerDatabaseTools(server: McpServer, manager: ConnectionManager) {
  /**
   * Tool 1: List all registered main connections, sub-connections, and pool states
   */
  server.tool(
    'db_list_connections',
    'List all registered main connections, their configured sub-connections (databases), and active connection pool status',
    {},
    async () => {
      const connections = manager.listConnectionsSummary();
      const allowedDbs = manager.getAllowedDatabases();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                count: connections.length,
                filteredMode: !!allowedDbs,
                ...(allowedDbs ? { allowedDatabases: Array.from(allowedDbs) } : {}),
                connections,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  /**
   * Tool 2: Discover all databases physically present on a main connection server
   */
  server.tool(
    'db_discover_databases',
    'Query the database server to discover all databases existing on a main connection host',
    {
      mainId: z.string().describe('ID of the main connection (e.g. "postgres_main" or "mysql_main")'),
    },
    async ({ mainId }) => {
      try {
        const adminAdapter = await manager.getAdminAdapter(mainId);
        const discovered = await adminAdapter.listDatabases();
        const allowedDbs = manager.getAllowedDatabases();
        const databases = allowedDbs
          ? discovered.filter((db) => manager.isDatabaseAllowed(db))
          : discovered;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  mainId,
                  filteredMode: !!allowedDbs,
                  ...(allowedDbs ? { allowedDatabases: Array.from(allowedDbs) } : {}),
                  totalDatabases: databases.length,
                  databases,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to discover databases for main connection "${mainId}": ${err.message}`,
            },
          ],
        };
      }
    }
  );

  /**
   * Tool: Crawl list of databases from main connection(s) and update connections.json
   */
  server.tool(
    'db_sync_databases',
    'Crawl database list from one or all main connection hosts and automatically update sub-connections in connections.json',
    {
      mainId: z
        .string()
        .optional()
        .describe('Specific main connection ID to crawl (e.g. "postgres" or "mysql56"). If omitted or "all", crawls all main connections'),
      includeSystemDatabases: z
        .boolean()
        .optional()
        .describe('Whether to include system databases (template0, information_schema, etc.). Default false'),
      removeMissing: z
        .boolean()
        .optional()
        .describe('Whether to remove sub-connections that no longer exist on the server. Default false'),
      persistToFile: z
        .boolean()
        .optional()
        .describe('Whether to save updated sub-connections directly into connections.json. Default true'),
    },
    async ({ mainId, includeSystemDatabases, removeMissing, persistToFile }) => {
      try {
        const allMainConfigs = manager.getAllMainConfigs();
        const targets: string[] = [];

        if (!mainId || mainId === 'all') {
          targets.push(...Array.from(allMainConfigs.keys()));
        } else {
          if (!allMainConfigs.has(mainId)) {
            const available = Array.from(allMainConfigs.keys()).join(', ');
            throw new Error(`Main connection "${mainId}" not found. Available: [${available}]`);
          }
          targets.push(mainId);
        }

        const syncResults = [];
        for (const targetId of targets) {
          const res = await manager.crawlAndSyncDatabases(targetId, {
            includeSystemDatabases,
            removeMissing,
          });
          syncResults.push(res);
        }

        if (persistToFile !== false) {
          saveConfigFile(allMainConfigs, manager.getAllowedDatabases());
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: `Successfully crawled and synced databases for ${targets.length} main connection(s).`,
                  fileUpdated: persistToFile !== false,
                  syncResults,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to crawl and sync databases: ${err.message}`,
            },
          ],
        };
      }
    }
  );


  /**
   * Tool 3: List tables in a specific database
   */
  server.tool(
    'db_list_tables',
    'List all tables and views in a target database. Provide either connectionId (sub-connection alias or "mainId:db") or mainId + database',
    {
      connectionId: z
        .string()
        .optional()
        .describe('Sub-connection ID / alias (e.g. "app_db") or composite ("mainId:db")'),
      mainId: z.string().optional().describe('Main connection ID (e.g. "postgres_main")'),
      database: z.string().optional().describe('Target database name on the main connection server'),
      schema: z.string().optional().describe('Filter by schema (e.g. "public" for PostgreSQL)'),
    },
    async ({ connectionId, mainId, database, schema }) => {
      try {
        const { adapter, target } = await manager.getAdapter({
          connectionId,
          mainId,
          database,
        });

        const tables = await adapter.listTables(schema);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  mainId: target.mainId,
                  database: target.database,
                  subConnectionId: target.subConnectionId,
                  tableCount: tables.length,
                  tables,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error listing tables: ${err.message}`,
            },
          ],
        };
      }
    }
  );

  /**
   * Tool 4: Describe a table (columns, types, nullability, primary keys)
   */
  server.tool(
    'db_describe_table',
    'Get schema structure of a table (columns, data types, nullability, primary key constraints).',
    {
      tableName: z.string().describe('Name of the table to describe'),
      connectionId: z
        .string()
        .optional()
        .describe('Sub-connection ID / alias (e.g. "app_db") or composite ("mainId:db")'),
      mainId: z.string().optional().describe('Main connection ID'),
      database: z.string().optional().describe('Target database name'),
      schema: z.string().optional().describe('Optional schema name'),
    },
    async ({ tableName, connectionId, mainId, database, schema }) => {
      try {
        const { adapter, target } = await manager.getAdapter({
          connectionId,
          mainId,
          database,
        });

        const columns = await adapter.describeTable(tableName, schema);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  mainId: target.mainId,
                  database: target.database,
                  tableName,
                  columnCount: columns.length,
                  columns,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Error describing table "${tableName}": ${err.message}`,
            },
          ],
        };
      }
    }
  );

  /**
   * Tool 5: Execute SQL Query with dynamic connection routing
   */
  server.tool(
    'db_execute_query',
    'Execute a SQL query against any database. Connection can be specified via connectionId (sub-connection alias or "mainId:db") or mainId + database',
    {
      query: z.string().describe('The SQL query to execute'),
      connectionId: z
        .string()
        .optional()
        .describe('Sub-connection alias (e.g. "app_db") or composite ("postgres_main:app_db")'),
      mainId: z.string().optional().describe('Main connection ID (e.g. "postgres_main")'),
      database: z.string().optional().describe('Database name on the main server (e.g. "app_db")'),
      params: z.array(z.any()).optional().describe('Optional parameterized values for prepared statements'),
      maxRows: z.number().optional().describe('Max rows to return (default: 100)'),
    },
    async ({ query, connectionId, mainId, database, params, maxRows }) => {
      try {
        const { adapter, target } = await manager.getAdapter({
          connectionId,
          mainId,
          database,
        });

        // Write rule safety enforcement with exceptions support
        const writeCheck = validateQueryAgainstWriteRule(
          query,
          target.effectiveWriteRule,
          target.database
        );
        if (!writeCheck.allowed) {
          throw new Error(writeCheck.reason);
        }

        const result = await adapter.query(query, params);
        const limit = maxRows || 100;
        const truncated = result.rows.length > limit;
        const returnedRows = truncated ? result.rows.slice(0, limit) : result.rows;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  mainId: target.mainId,
                  database: target.database,
                  subConnectionId: target.subConnectionId,
                  executionTimeMs: result.executionTimeMs,
                  totalRows: result.rowCount,
                  returnedRowsCount: returnedRows.length,
                  truncated,
                  fields: result.fields,
                  rows: returnedRows,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Query execution error: ${err.message}`,
            },
          ],
        };
      }
    }
  );

  /**
   * Tool 6: Test connection
   */
  server.tool(
    'db_test_connection',
    'Test connectivity to a main connection or a specific database',
    {
      connectionId: z.string().optional().describe('Sub-connection alias or composite ID'),
      mainId: z.string().optional().describe('Main connection ID'),
      database: z.string().optional().describe('Database name'),
    },
    async ({ connectionId, mainId, database }) => {
      try {
        const { adapter, target } = await manager.getAdapter({
          connectionId,
          mainId,
          database,
        });
        const testRes = await adapter.testConnection();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  ok: testRes.ok,
                  mainId: target.mainId,
                  database: target.database,
                  message: testRes.message,
                  version: testRes.version,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Connection test failed: ${err.message}`,
            },
          ],
        };
      }
    }
  );

  /**
   * Tool 7: Register or update a main connection dynamically at runtime
   */
  server.tool(
    'db_register_main_connection',
    'Dynamically add or update a main database connection configuration at runtime',
    {
      id: z.string().describe('Unique ID for this main connection (e.g. "local_pg" or "office_mysql")'),
      engine: z.enum(['postgres', 'mysql']).describe('Engine type: "postgres" or "mysql"'),
      host: z.string().describe('Host address or IP'),
      port: z.number().optional().describe('Port number (default 5432 for postgres, 3306 for mysql)'),
      user: z.string().describe('Username'),
      password: z.string().optional().describe('Password'),
      defaultDatabase: z.string().optional().describe('Default/admin database name'),
      description: z.string().optional().describe('Optional description'),
      persistToFile: z.boolean().optional().describe('Whether to save this configuration to connections.json (default true)'),
    },
    async (args) => {
      try {
        manager.registerMainConnection({
          id: args.id,
          engine: args.engine,
          host: args.host,
          port: args.port,
          user: args.user,
          password: args.password,
          defaultDatabase: args.defaultDatabase,
          description: args.description,
        });

        if (args.persistToFile !== false) {
          const allSummaries = manager.listConnectionsSummary();
          const map = new Map();
          for (const s of allSummaries) {
            map.set(s.mainId, {
              id: s.mainId,
              engine: s.engine,
              host: s.host,
              port: s.port,
              user: s.user,
              defaultDatabase: s.defaultDatabase,
              description: s.description,
              subConnections: s.subConnections,
            });
          }
          saveConfigFile(map, manager.getAllowedDatabases());
        }

        return {
          content: [
            {
              type: 'text',
              text: `Main connection "${args.id}" registered successfully.`,
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to register main connection: ${err.message}`,
            },
          ],
        };
      }
    }
  );

  /**
   * Tool 8: Register a sub-connection alias dynamically
   */
  server.tool(
    'db_register_sub_connection',
    'Dynamically register a sub-connection (database alias) under an existing main connection',
    {
      mainId: z.string().describe('Existing main connection ID'),
      id: z.string().describe('Sub-connection alias ID (e.g. "sales_db")'),
      database: z.string().describe('Actual database name on the main server'),
      description: z.string().optional().describe('Optional description'),
      readOnly: z.boolean().optional().describe('Set to true to prevent write operations'),
      persistToFile: z.boolean().optional().describe('Whether to save to connections.json (default true)'),
    },
    async (args) => {
      try {
        if (manager.getAllowedDatabases() !== null && !manager.isDatabaseAllowed(args.database, args.id)) {
          throw new Error(
            `Access denied: Cannot register database "${args.database}". Allowed databases for this server: [${Array.from(manager.getAllowedDatabases()!).join(', ')}]`
          );
        }

        manager.registerSubConnection(args.mainId, {
          id: args.id,
          database: args.database,
          description: args.description,
          readOnly: args.readOnly,
        });

        if (args.persistToFile !== false) {
          const allSummaries = manager.listConnectionsSummary();
          const map = new Map();
          for (const s of allSummaries) {
            map.set(s.mainId, {
              id: s.mainId,
              engine: s.engine,
              host: s.host,
              port: s.port,
              user: s.user,
              defaultDatabase: s.defaultDatabase,
              description: s.description,
              subConnections: s.subConnections,
            });
          }
          saveConfigFile(map, manager.getAllowedDatabases());
        }

        return {
          content: [
            {
              type: 'text',
              text: `Sub-connection "${args.id}" mapped to database "${args.database}" under main connection "${args.mainId}".`,
            },
          ],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to register sub-connection: ${err.message}`,
            },
          ],
        };
      }
    }
  );
}
