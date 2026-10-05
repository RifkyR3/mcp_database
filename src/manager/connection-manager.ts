import { createDatabaseAdapter, DatabaseAdapter } from '../adapters/index.js';
import {
  MainConnectionConfig,
  ResolvedTarget,
  SubConnectionConfig,
  WriteRuleConfig,
} from '../config/types.js';
import { parseGlobalWriteRule, resolveEffectiveWriteRule } from '../security/write-rules.js';

export class ConnectionManager {
  private mainConfigs: Map<string, MainConnectionConfig> = new Map();
  private subAliases: Map<
    string,
    { mainId: string; database: string; subConfig?: SubConnectionConfig; readOnly?: boolean }
  > = new Map();
  private pools: Map<string, DatabaseAdapter> = new Map();
  private allowedDatabases: Set<string> | null = null;
  private globalWriteRule: WriteRuleConfig = {};

  constructor(
    initialConfigs: MainConnectionConfig[] = [],
    allowedDatabases: Set<string> | null = null,
    globalWriteRule: WriteRuleConfig = parseGlobalWriteRule()
  ) {
    this.allowedDatabases = allowedDatabases;
    this.globalWriteRule = globalWriteRule;
    for (const config of initialConfigs) {
      this.registerMainConnection(config);
    }
  }

  /**
   * Register or update a main connection
   */
  public registerMainConnection(config: MainConnectionConfig): void {
    this.mainConfigs.set(config.id, config);

    // Register pre-configured sub-connections
    if (config.subConnections && Array.isArray(config.subConnections)) {
      for (const sub of config.subConnections) {
        this.registerSubConnection(config.id, sub);
      }
    }
  }

  /**
   * Register a sub-connection alias under a main connection
   */
  public registerSubConnection(mainId: string, sub: SubConnectionConfig): void {
    if (!this.mainConfigs.has(mainId)) {
      throw new Error(`Cannot register sub-connection: Main connection "${mainId}" not found`);
    }

    const main = this.mainConfigs.get(mainId)!;
    if (!main.subConnections) {
      main.subConnections = [];
    }

    // Update or add in main config
    const existingIndex = main.subConnections.findIndex((s) => s.id === sub.id);
    if (existingIndex >= 0) {
      main.subConnections[existingIndex] = sub;
    } else {
      main.subConnections.push(sub);
    }

    // Register alias in lookup map
    this.subAliases.set(sub.id, {
      mainId,
      database: sub.database,
      subConfig: sub,
      readOnly: sub.readOnly,
    });
  }

  /**
   * Resolves connection target dynamically from multiple possible inputs:
   * 1. Sub-connection alias ID (e.g. "sales_db")
   * 2. Composite ID (e.g. "main_id:database_name" or "main_id/database_name")
   * 3. Explicit { mainId, database }
   * 4. Main ID with defaultDatabase
   */
  public resolveTarget(params: {
    connectionId?: string;
    mainId?: string;
    database?: string;
  }): ResolvedTarget {
    const { connectionId, mainId, database } = params;

    const finishResolve = (
      resolvedMainId: string,
      resolvedMainConfig: MainConnectionConfig,
      resolvedDb: string,
      resolvedSubId?: string,
      resolvedSubConfig?: SubConnectionConfig
    ): ResolvedTarget => {
      const sub =
        resolvedSubConfig ||
        resolvedMainConfig.subConnections?.find(
          (s) => s.database === resolvedDb || s.id === resolvedSubId
        );

      const effectiveWriteRule = resolveEffectiveWriteRule(
        this.globalWriteRule,
        resolvedMainConfig,
        sub
      );

      return {
        mainId: resolvedMainId,
        mainConfig: resolvedMainConfig,
        database: resolvedDb,
        subConnectionId: resolvedSubId || sub?.id,
        subConfig: sub,
        effectiveWriteRule,
        readOnly:
          !effectiveWriteRule.allow &&
          (!effectiveWriteRule.exceptions || effectiveWriteRule.exceptions.length === 0),
      };
    };

    // 1. Direct sub-connection alias lookup
    if (connectionId && this.subAliases.has(connectionId)) {
      const alias = this.subAliases.get(connectionId)!;
      const mainConfig = this.mainConfigs.get(alias.mainId);
      if (!mainConfig) {
        throw new Error(`Main connection "${alias.mainId}" referenced by alias "${connectionId}" was not found`);
      }
      return finishResolve(alias.mainId, mainConfig, alias.database, connectionId, alias.subConfig);
    }

    // 2. Check for composite connectionId "main:db" or "main/db"
    if (connectionId && (connectionId.includes(':') || connectionId.includes('/'))) {
      const separator = connectionId.includes(':') ? ':' : '/';
      const [parsedMainId, ...rest] = connectionId.split(separator);
      const parsedDb = rest.join(separator);

      const mainConfig = this.mainConfigs.get(parsedMainId);
      if (!mainConfig) {
        throw new Error(`Main connection "${parsedMainId}" in composite ID "${connectionId}" not found`);
      }
      return finishResolve(parsedMainId, mainConfig, parsedDb);
    }

    // 3. ConnectionId matched directly with a main connection ID
    if (connectionId && this.mainConfigs.has(connectionId)) {
      const mainConfig = this.mainConfigs.get(connectionId)!;
      const targetDb = database || mainConfig.defaultDatabase || (mainConfig.subConnections?.length === 1 ? mainConfig.subConnections[0].database : undefined);

      if (!targetDb) {
        const availableSubs = (mainConfig.subConnections || []).map((s) => s.id).join(', ');
        throw new Error(
          `Main connection "${connectionId}" exists, but no target database was specified. ` +
          `Provide "database" parameter or use one of the sub-connections: [${availableSubs}]`
        );
      }

      return finishResolve(connectionId, mainConfig, targetDb);
    }

    // 4. Explicit mainId passed
    if (mainId) {
      const mainConfig = this.mainConfigs.get(mainId);
      if (!mainConfig) {
        const available = Array.from(this.mainConfigs.keys()).join(', ');
        throw new Error(`Main connection "${mainId}" not found. Available main connections: [${available}]`);
      }

      const targetDb = database || mainConfig.defaultDatabase || (mainConfig.subConnections?.length === 1 ? mainConfig.subConnections[0].database : undefined);

      if (!targetDb) {
        const availableSubs = (mainConfig.subConnections || []).map((s) => `${s.id} (${s.database})`).join(', ');
        throw new Error(
          `Main connection "${mainId}" requires a database name. ` +
          `Please provide the "database" parameter or choose from sub-connections: [${availableSubs}]`
        );
      }

      return finishResolve(mainId, mainConfig, targetDb);
    }

    // 5. Fallback: If only 1 main connection exists and database or sub connection is unique
    if (this.mainConfigs.size === 1) {
      const [singleMainId, singleMainConfig] = Array.from(this.mainConfigs.entries())[0];
      const targetDb = database || singleMainConfig.defaultDatabase || (singleMainConfig.subConnections?.length === 1 ? singleMainConfig.subConnections[0].database : undefined);

      if (targetDb) {
        return finishResolve(singleMainId, singleMainConfig, targetDb);
      }
    }

    const availableMains = Array.from(this.mainConfigs.keys()).join(', ');
    const availableSubs = Array.from(this.subAliases.keys()).join(', ');
    throw new Error(
      `No valid connection specified. Please provide "connectionId" (alias or "main:db") or "mainId" with "database".\n` +
      `Available Main Connections: [${availableMains}]\n` +
      `Available Sub-Connections: [${availableSubs}]`
    );
  }

  /**
   * Retrieves an active database adapter/pool for the target database
   */
  public async getAdapter(params: {
    connectionId?: string;
    mainId?: string;
    database?: string;
  }): Promise<{ adapter: DatabaseAdapter; target: ResolvedTarget }> {
    const target = this.resolveTarget(params);

    if (this.allowedDatabases !== null) {
      const isAllowed =
        this.allowedDatabases.has(target.database) ||
        (target.subConnectionId ? this.allowedDatabases.has(target.subConnectionId) : false);

      if (!isAllowed) {
        throw new Error(
          `Access denied: Database "${target.database}" is restricted. Allowed databases for this server: [${Array.from(this.allowedDatabases).join(', ')}]`
        );
      }
    }

    const poolKey = `${target.mainId}::${target.database}`;

    let adapter = this.pools.get(poolKey);
    if (!adapter) {
      adapter = createDatabaseAdapter(target.mainConfig, target.database);
      await adapter.connect();
      this.pools.set(poolKey, adapter);
    }

    return { adapter, target };
  }

  /**
   * Returns an admin adapter to query database server metadata (e.g. SHOW DATABASES / list pg_database)
   */
  public async getAdminAdapter(mainId: string): Promise<DatabaseAdapter> {
    const mainConfig = this.mainConfigs.get(mainId);
    if (!mainConfig) {
      throw new Error(`Main connection "${mainId}" not found`);
    }

    const defaultDb =
      mainConfig.defaultDatabase ||
      (mainConfig.engine === 'postgres' ? 'postgres' : 'information_schema');

    const poolKey = `${mainId}::${defaultDb}::admin`;
    let adapter = this.pools.get(poolKey);
    if (!adapter) {
      adapter = createDatabaseAdapter(mainConfig, defaultDb);
      await adapter.connect();
      this.pools.set(poolKey, adapter);
    }

    return adapter;
  }

  /**
   * List all registered connections and their configurations
   */
  public listConnectionsSummary() {
    const list: Array<{
      mainId: string;
      engine: string;
      host: string;
      port?: number;
      user: string;
      defaultDatabase?: string;
      description?: string;
      writeRule?: WriteRuleConfig;
      subConnections: Array<{
        id: string;
        database: string;
        description?: string;
        effectiveWriteRule: WriteRuleConfig;
        readOnly?: boolean;
      }>;
      activePools: string[];
    }> = [];

    for (const [mainId, config] of this.mainConfigs.entries()) {
      const activePoolsForMain = Array.from(this.pools.keys())
        .filter((k) => k.startsWith(`${mainId}::`))
        .map((k) => k.split('::')[1]);

      const subSummaries = (config.subConnections || []).map((sub) => ({
        id: sub.id,
        database: sub.database,
        description: sub.description,
        effectiveWriteRule: resolveEffectiveWriteRule(this.globalWriteRule, config, sub),
        readOnly: sub.readOnly,
      }));

      list.push({
        mainId,
        engine: config.engine,
        host: config.host,
        port: config.port,
        user: config.user,
        defaultDatabase: config.defaultDatabase,
        description: config.description,
        writeRule: resolveEffectiveWriteRule(this.globalWriteRule, config),
        subConnections: subSummaries,
        activePools: activePoolsForMain,
      });
    }

    return list;
  }

  public getMainConfig(mainId: string): MainConnectionConfig | undefined {
    return this.mainConfigs.get(mainId);
  }

  public getAllMainConfigs(): Map<string, MainConnectionConfig> {
    return this.mainConfigs;
  }

  /**
   * Crawls databases from the main database server and syncs sub-connections
   */
  public async crawlAndSyncDatabases(
    mainId: string,
    options: {
      includeSystemDatabases?: boolean;
      exclude?: string[];
      removeMissing?: boolean;
    } = {}
  ): Promise<{
    mainId: string;
    totalDiscovered: number;
    syncedDatabases: string[];
    addedCount: number;
    existingCount: number;
    removedCount: number;
  }> {
    const mainConfig = this.mainConfigs.get(mainId);
    if (!mainConfig) {
      throw new Error(`Main connection "${mainId}" not found`);
    }

    const adminAdapter = await this.getAdminAdapter(mainId);
    const discoveredRaw = await adminAdapter.listDatabases();

    // System databases to filter out by default
    const defaultExcludes =
      mainConfig.engine === 'postgres'
        ? ['template0', 'template1']
        : ['information_schema', 'performance_schema', 'sys', 'mysql'];

    const userExcludes = new Set(options.exclude || []);
    const shouldFilterSystem = !options.includeSystemDatabases;

    const filteredDatabases = discoveredRaw.filter((db) => {
      if (userExcludes.has(db)) return false;
      if (shouldFilterSystem && defaultExcludes.includes(db)) return false;
      return true;
    });

    const currentSubs = mainConfig.subConnections || [];
    const subMap = new Map<string, SubConnectionConfig>();
    for (const sub of currentSubs) {
      subMap.set(sub.database, sub);
    }

    let addedCount = 0;
    let existingCount = 0;
    const newSubList: SubConnectionConfig[] = [];

    for (const dbName of filteredDatabases) {
      if (subMap.has(dbName)) {
        // Keep existing configuration (preserves custom alias id, description, readOnly)
        newSubList.push(subMap.get(dbName)!);
        existingCount++;
      } else {
        // Add newly discovered database
        const newSub: SubConnectionConfig = {
          id: dbName,
          database: dbName,
          description: `Discovered database "${dbName}"`,
        };
        newSubList.push(newSub);
        this.registerSubConnection(mainId, newSub);
        addedCount++;
      }
    }

    let removedCount = 0;
    if (options.removeMissing) {
      const discoveredSet = new Set(filteredDatabases);
      for (const sub of currentSubs) {
        if (!discoveredSet.has(sub.database)) {
          this.subAliases.delete(sub.id);
          removedCount++;
        }
      }
    } else {
      // Keep any manual sub-connections that weren't discovered
      for (const sub of currentSubs) {
        if (!newSubList.some((s) => s.database === sub.database)) {
          newSubList.push(sub);
        }
      }
    }

    mainConfig.subConnections = newSubList;

    return {
      mainId,
      totalDiscovered: filteredDatabases.length,
      syncedDatabases: filteredDatabases,
      addedCount,
      existingCount,
      removedCount,
    };
  }

  /**
   * Close all connection pools
   */
  public async closeAll(): Promise<void> {
    for (const [key, adapter] of this.pools.entries()) {
      try {
        await adapter.close();
      } catch (err) {
        console.error(`Error closing pool for ${key}:`, err);
      }
    }
    this.pools.clear();
  }
}
