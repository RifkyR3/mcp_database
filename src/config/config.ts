import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { AppConfig, MainConnectionConfig } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '../..');

// Load .env from process.cwd() or fallback to package root
dotenv.config();
const packageEnv = path.resolve(packageRoot, '.env');
if (fs.existsSync(packageEnv)) {
  dotenv.config({ path: packageEnv });
}

const DEFAULT_CONFIG_FILE = 'connections.json';

export function getConfigFilepath(): string {
  if (process.env.MCP_DB_CONFIG_PATH) {
    return path.resolve(process.env.MCP_DB_CONFIG_PATH);
  }
  const cwdPath = path.resolve(process.cwd(), DEFAULT_CONFIG_FILE);
  if (fs.existsSync(cwdPath)) {
    return cwdPath;
  }
  const packagePath = path.resolve(packageRoot, DEFAULT_CONFIG_FILE);
  if (fs.existsSync(packagePath)) {
    return packagePath;
  }
  return cwdPath;
}

export function getAllowedDatabases(): Set<string> | null {
  const allowed = new Set<string>();

  const cleanItem = (s: string): string => {
    return s.trim().replace(/^['"]|['"]$/g, '');
  };

  const addItems = (val: string) => {
    if (!val) return;
    const trimmed = val.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          parsed.map((item) => cleanItem(String(item))).filter(Boolean).forEach((s) => allowed.add(s));
          return;
        }
      } catch {
        // Fall back to delimiter parsing
      }
    }

    let parts: string[] = [];
    if (trimmed.includes(',')) {
      parts = trimmed.split(',');
    } else if (trimmed.includes(';')) {
      parts = trimmed.split(';');
    } else if (trimmed.includes(' ')) {
      parts = trimmed.split(/\s+/);
    } else {
      parts = [trimmed];
    }

    parts.map(cleanItem).filter(Boolean).forEach((s) => allowed.add(s));
  };

  // 1. Check CLI args: --databases=a,b or --database=a,b or --dbs=a,b or --db=a,b or --filter=a,b
  const args = process.argv.slice(2);
  const flagPrefixes = ['--databases=', '--database=', '--dbs=', '--db=', '--filter='];
  const standaloneFlags = ['--databases', '--database', '--dbs', '--db', '--filter'];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const matchPrefix = flagPrefixes.find((p) => arg.startsWith(p));
    if (matchPrefix) {
      const val = arg.slice(matchPrefix.length);
      addItems(val);
    } else if (standaloneFlags.includes(arg)) {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        addItems(nextArg);
        i++;
      }
    }
  }

  // 2. Check Environment variables
  const envVal = process.env.ALLOWED_DATABASES || process.env.SPECIFIC_DATABASES;
  if (envVal) {
    addItems(envVal);
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

    const isDefaultDbAllowed = !!(main.defaultDatabase && allowedDbs.has(main.defaultDatabase));

    if (matchingSubs.length > 0) {
      filtered.push({
        ...main,
        defaultDatabase: isDefaultDbAllowed
          ? main.defaultDatabase
          : (matchingSubs.length === 1 ? matchingSubs[0].database : undefined),
        subConnections: matchingSubs,
      });
    } else if (isDefaultDbAllowed) {
      filtered.push({
        ...main,
        subConnections: [],
      });
    } else if (!main.subConnections || main.subConnections.length === 0) {
      // Main connection had no sub-connections configured at all.
      // Auto-populate allowed databases for this host so they can be accessed.
      const autoSubs = Array.from(allowedDbs).map((db) => ({
        id: db,
        database: db,
        description: `Allowed database "${db}"`,
      }));
      filtered.push({
        ...main,
        defaultDatabase: autoSubs.length === 1 ? autoSubs[0].database : undefined,
        subConnections: autoSubs,
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

export function saveConfigFile(
  configs: Map<string, MainConnectionConfig>,
  allowedDatabases: Set<string> | null = null
): void {
  const filepath = getConfigFilepath();
  let existingConnections: Record<string, MainConnectionConfig> = {};

  if (allowedDatabases && allowedDatabases.size > 0 && fs.existsSync(filepath)) {
    try {
      const content = fs.readFileSync(filepath, 'utf-8');
      const parsed: AppConfig = JSON.parse(content);
      if (parsed.connections && typeof parsed.connections === 'object') {
        existingConnections = parsed.connections;
      }
    } catch {
      // Ignore read error, proceed with direct overwrite
    }
  }

  const connectionsObj: Record<string, MainConnectionConfig> = { ...existingConnections };

  for (const [id, config] of configs.entries()) {
    if (allowedDatabases && allowedDatabases.size > 0 && connectionsObj[id]) {
      // Merge: keep existing subConnections from disk that are NOT in allowedDatabases
      const existingSubs = connectionsObj[id].subConnections || [];
      const preservedSubs = existingSubs.filter(
        (sub) => !allowedDatabases.has(sub.database) && !allowedDatabases.has(sub.id)
      );
      connectionsObj[id] = {
        ...connectionsObj[id],
        ...config,
        subConnections: [...preservedSubs, ...(config.subConnections || [])],
      };
    } else {
      connectionsObj[id] = config;
    }
  }

  const data: AppConfig = { connections: connectionsObj };
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
}
