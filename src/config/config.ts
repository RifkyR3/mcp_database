import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { AppConfig, MainConnectionConfig } from './types.js';

dotenv.config();

const DEFAULT_CONFIG_FILE = 'connections.json';

export function getConfigFilepath(): string {
  if (process.env.MCP_DB_CONFIG_PATH) {
    return path.resolve(process.env.MCP_DB_CONFIG_PATH);
  }
  return path.resolve(process.cwd(), DEFAULT_CONFIG_FILE);
}

export function getAllowedDatabases(): Set<string> | null {
  const allowed = new Set<string>();

  // 1. Check CLI args: --databases=a,b or --dbs=a,b or --databases a,b
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--databases=') || arg.startsWith('--dbs=') || arg.startsWith('--filter=')) {
      const val = arg.split('=')[1];
      if (val) {
        val.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => allowed.add(s));
      }
    } else if (arg === '--databases' || arg === '--dbs' || arg === '--filter') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        nextArg.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => allowed.add(s));
        i++;
      }
    }
  }

  // 2. Check Environment variables
  const envVal = process.env.ALLOWED_DATABASES || process.env.SPECIFIC_DATABASES;
  if (envVal) {
    envVal.split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => allowed.add(s));
  }

  return allowed.size > 0 ? allowed : null;
}

export function filterConfigByAllowedDatabases(
  configs: MainConnectionConfig[],
  allowedDbs: Set<string> | null
): MainConnectionConfig[] {
  if (!allowedDbs || allowedDbs.size === 0) return configs;

  const filtered: MainConnectionConfig[] = [];

  for (const main of configs) {
    const matchingSubs = (main.subConnections || []).filter(
      (sub) => allowedDbs.has(sub.database) || allowedDbs.has(sub.id)
    );

    // If main connection has matching sub-connections OR its defaultDatabase matches
    if (matchingSubs.length > 0) {
      filtered.push({
        ...main,
        subConnections: matchingSubs,
      });
    } else if (main.defaultDatabase && allowedDbs.has(main.defaultDatabase)) {
      filtered.push({
        ...main,
        subConnections: [],
      });
    }
  }

  return filtered;
}

export function loadInitialConfig(filterAllowed = true): {
  configs: MainConnectionConfig[];
  allowedDatabases: Set<string> | null;
} {
  const filepath = getConfigFilepath();
  let rawConfigs: MainConnectionConfig[] = [];

  if (fs.existsSync(filepath)) {
    try {
      const content = fs.readFileSync(filepath, 'utf-8');
      const parsed: AppConfig = JSON.parse(content);
      if (parsed.connections && typeof parsed.connections === 'object') {
        for (const [id, conn] of Object.entries(parsed.connections)) {
          rawConfigs.push({
            ...conn,
            id: conn.id || id,
          });
        }
      }
    } catch (err: any) {
      console.error(`[Warning] Failed to parse ${filepath}: ${err.message}`);
    }
  } else {
    const exampleFile = path.resolve(process.cwd(), 'connections.example.json');
    if (fs.existsSync(exampleFile)) {
      console.error(
        `[Notice] Configuration file "${filepath}" not found.\n` +
        `💡 Tip: Copy "connections.example.json" to "${filepath}" and adjust your database credentials.`
      );
    }
  }

  // Fallback to environment variables if empty
  if (rawConfigs.length === 0) {
    if (process.env.POSTGRES_HOST && process.env.POSTGRES_USER) {
      rawConfigs.push({
        id: 'postgres_env',
        engine: 'postgres',
        host: process.env.POSTGRES_HOST,
        port: process.env.POSTGRES_PORT ? parseInt(process.env.POSTGRES_PORT, 10) : 5432,
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD || '',
        defaultDatabase: process.env.POSTGRES_DEFAULT_DB || 'postgres',
        subConnections: process.env.POSTGRES_DATABASES
          ? process.env.POSTGRES_DATABASES.split(',').map((db) => ({
              id: db.trim(),
              database: db.trim(),
            }))
          : [],
      });
    }

    if (process.env.MYSQL_HOST && process.env.MYSQL_USER) {
      rawConfigs.push({
        id: 'mysql_env',
        engine: 'mysql',
        host: process.env.MYSQL_HOST,
        port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT, 10) : 3306,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD || '',
        defaultDatabase: process.env.MYSQL_DEFAULT_DB || 'information_schema',
        subConnections: process.env.MYSQL_DATABASES
          ? process.env.MYSQL_DATABASES.split(',').map((db) => ({
              id: db.trim(),
              database: db.trim(),
            }))
          : [],
      });
    }
  }

  const allowedDatabases = getAllowedDatabases();
  const configs = filterAllowed ? filterConfigByAllowedDatabases(rawConfigs, allowedDatabases) : rawConfigs;

  return { configs, allowedDatabases };
}

export function saveConfigFile(configs: Map<string, MainConnectionConfig>): void {
  const filepath = getConfigFilepath();
  const connectionsObj: Record<string, MainConnectionConfig> = {};

  for (const [id, config] of configs.entries()) {
    connectionsObj[id] = config;
  }

  const data: AppConfig = { connections: connectionsObj };
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
}
