import assert from 'node:assert';
import {
  sanitizeSql,
  extractSqlOperations,
  validateQueryAgainstWriteRule,
  resolveEffectiveWriteRule,
} from '../src/security/write-rules.js';
import {
  filterConfigByAllowedDatabases,
  getAllowedDatabases,
} from '../src/config/config.js';
import { ConnectionManager } from '../src/manager/connection-manager.js';
import { MainConnectionConfig } from '../src/config/types.js';

console.log('🧪 Running Write Rules Unit Tests...');

// 1. sanitizeSql
{
  const raw = '/* comment */ SELECT * FROM users -- inline comment\nWHERE id = 1;';
  const sanitized = sanitizeSql(raw);
  assert.strictEqual(sanitized.includes('comment'), false, 'Should strip comments');
}

// 2. extractSqlOperations
{
  const ops = extractSqlOperations('SELECT 1; UPDATE users SET name = "test";');
  assert.deepStrictEqual(ops, ['SELECT', 'UPDATE'], 'Should extract multiple SQL verbs');
}

// 3. validateQueryAgainstWriteRule - Safe Reads
{
  const rule = { allow: false, exceptions: [] };
  const res = validateQueryAgainstWriteRule('SELECT * FROM tbl', rule, 'test_db');
  assert.strictEqual(res.allowed, true, 'SELECT should always be allowed even when allow=false');
}

// 4. validateQueryAgainstWriteRule - Write forbidden when allow=false and no exception
{
  const rule = { allow: false, exceptions: ['INSERT'] };
  const resDelete = validateQueryAgainstWriteRule('DELETE FROM tbl WHERE id = 1', rule, 'test_db');
  assert.strictEqual(resDelete.allowed, false, 'DELETE should be blocked when allow=false and not in exceptions');

  const resInsert = validateQueryAgainstWriteRule('INSERT INTO tbl VALUES (1)', rule, 'test_db');
  assert.strictEqual(resInsert.allowed, true, 'INSERT should be permitted when in exceptions');
}

// 5. resolveEffectiveWriteRule - Hierarchy
{
  const globalRule = { allow: true, exceptions: [] };
  const mainConfig: any = { id: 'm1', engine: 'postgres', allowWrite: false, writeExceptions: ['UPDATE'] };
  const subConfig: any = { id: 's1', database: 'd1', allowWrite: false, writeExceptions: ['INSERT'] };

  // Sub overrides main
  const effectiveSub = resolveEffectiveWriteRule(globalRule, mainConfig, subConfig);
  assert.strictEqual(effectiveSub.allow, false);
  assert.deepStrictEqual(effectiveSub.exceptions, ['INSERT']);

  // Main overrides global
  const effectiveMain = resolveEffectiveWriteRule(globalRule, mainConfig, undefined);
  assert.strictEqual(effectiveMain.allow, false);
  assert.deepStrictEqual(effectiveMain.exceptions, ['UPDATE']);

  // Global fallback
  const effectiveGlobal = resolveEffectiveWriteRule(globalRule, undefined, undefined);
  assert.strictEqual(effectiveGlobal.allow, true);
}

// 6. ALLOWED_DATABASES Config and Filter Tests
console.log('🧪 Running ALLOWED_DATABASES Unit Tests...');

// 6.1 filterConfigByAllowedDatabases
{
  const sampleConfigs: MainConnectionConfig[] = [
    {
      id: 'pg_main',
      engine: 'postgres',
      host: 'localhost',
      user: 'postgres',
      defaultDatabase: 'restricted_internal_db',
      subConnections: [
        { id: 'app_db', database: 'app_db' },
        { id: 'restricted_internal_db', database: 'restricted_internal_db' },
        { id: 'analytics_db', database: 'analytics_db' },
      ],
    },
    {
      id: 'mysql_main',
      engine: 'mysql',
      host: 'localhost',
      user: 'root',
      defaultDatabase: 'other_db',
      subConnections: [
        { id: 'other_db', database: 'other_db' },
      ],
    },
  ];

  const allowed = new Set(['app_db']);
  const filtered = filterConfigByAllowedDatabases(sampleConfigs, allowed);

  // mysql_main should be completely excluded because it has no allowed dbs
  assert.strictEqual(filtered.length, 1, 'Only main connections with allowed databases should be kept');
  assert.strictEqual(filtered[0].id, 'pg_main');

  // subConnections should only contain 'app_db'
  assert.strictEqual(filtered[0].subConnections?.length, 1);
  assert.strictEqual(filtered[0].subConnections?.[0].database, 'app_db');

  // defaultDatabase should be sanitized (not restricted_internal_db)
  assert.strictEqual(filtered[0].defaultDatabase, 'app_db', 'defaultDatabase should point to allowed db');
}

// 6.2 ConnectionManager with allowedDatabases
{
  const sampleConfigs: MainConnectionConfig[] = [
    {
      id: 'pg_main',
      engine: 'postgres',
      host: 'localhost',
      user: 'postgres',
      defaultDatabase: 'restricted_db',
      subConnections: [
        { id: 'app_db', database: 'app_db' },
        { id: 'restricted_db', database: 'restricted_db' },
      ],
    },
    {
      id: 'oracle_main',
      engine: 'postgres',
      host: 'localhost',
      user: 'oracle',
      defaultDatabase: 'oracle_db',
      subConnections: [
        { id: 'oracle_db', database: 'oracle_db' },
      ],
    },
  ];

  const allowed = new Set(['app_db']);
  const manager = new ConnectionManager(sampleConfigs, allowed);

  // listConnectionsSummary
  const summary = manager.listConnectionsSummary();
  assert.strictEqual(summary.length, 1, 'Only pg_main should appear in summary');
  assert.strictEqual(summary[0].mainId, 'pg_main');
  assert.strictEqual(summary[0].subConnections.length, 1);
  assert.strictEqual(summary[0].subConnections[0].database, 'app_db');
  assert.strictEqual(summary[0].defaultDatabase, 'app_db');

  // Attempting to resolve restricted database should fail
  assert.throws(
    () => {
      manager.resolveTarget({ mainId: 'pg_main', database: 'restricted_db' });
    },
    /Access denied|restricted/i,
    'Resolving restricted database directly should be denied'
  );

  // Attempting to register unallowed sub-connection should fail
  assert.throws(
    () => {
      manager.registerSubConnection('pg_main', { id: 'evil_db', database: 'evil_db' });
    },
    /restricted|not in ALLOWED_DATABASES/i,
    'Registering unallowed sub-connection must be blocked'
  );

  // Resolving without database should safely pick allowed sub-connection
  const resolved = manager.resolveTarget({ mainId: 'pg_main' });
  assert.strictEqual(resolved.database, 'app_db');
}

// 6.3 Auto-population when host has no configured subConnections
{
  const bareConfig: MainConnectionConfig[] = [
    {
      id: 'bare_host',
      engine: 'postgres',
      host: 'localhost',
      user: 'postgres',
    },
  ];
  const allowed = new Set(['app_db', 'store_db']);
  const filtered = filterConfigByAllowedDatabases(bareConfig, allowed);

  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].subConnections?.length, 2);
  assert.deepStrictEqual(
    filtered[0].subConnections?.map((s) => s.database).sort(),
    ['app_db', 'store_db']
  );
}

// 6.4 getAllowedDatabases parsing
{
  const origArgv = process.argv;
  const origEnv = process.env.ALLOWED_DATABASES;

  try {
    delete process.env.ALLOWED_DATABASES;
    delete process.env.SPECIFIC_DATABASES;

    // Test --databases=a,b
    process.argv = ['node', 'index.js', '--databases=db1,db2'];
    const res1 = getAllowedDatabases();
    assert.deepStrictEqual(Array.from(res1 || []).sort(), ['db1', 'db2']);

    // Test --db flag
    process.argv = ['node', 'index.js', '--db', 'single_db'];
    const res2 = getAllowedDatabases();
    assert.deepStrictEqual(Array.from(res2 || []), ['single_db']);

    // Test JSON array in env
    process.argv = ['node', 'index.js'];
    process.env.ALLOWED_DATABASES = '["db_a", "db_b"]';
    const res3 = getAllowedDatabases();
    assert.deepStrictEqual(Array.from(res3 || []).sort(), ['db_a', 'db_b']);

    // Test comma-separated with quotes
    process.env.ALLOWED_DATABASES = '"db_x", "db_y"';
    const res4 = getAllowedDatabases();
    assert.deepStrictEqual(Array.from(res4 || []).sort(), ['db_x', 'db_y']);
  } finally {
    process.argv = origArgv;
    if (origEnv !== undefined) {
      process.env.ALLOWED_DATABASES = origEnv;
    } else {
      delete process.env.ALLOWED_DATABASES;
    }
  }
}

// 6.5 crawlAndSyncDatabases with allowedDatabases filter
{
  const mockConfig: MainConnectionConfig[] = [
    {
      id: 'pg_mock',
      engine: 'postgres',
      host: 'localhost',
      user: 'postgres',
      subConnections: [
        { id: 'allowed_existing', database: 'allowed_existing' },
        { id: 'unallowed_existing', database: 'unallowed_existing' },
      ],
    },
  ];

  const allowed = new Set(['allowed_existing', 'allowed_new']);
  const manager = new ConnectionManager(mockConfig, allowed);

  // Mock getAdminAdapter
  (manager as any).getAdminAdapter = async () => ({
    listDatabases: async () => [
      'allowed_existing',
      'allowed_new',
      'forbidden_discovered_1',
      'forbidden_discovered_2',
    ],
  });

  const syncResult = await manager.crawlAndSyncDatabases('pg_mock', { removeMissing: true });

  // Discovered list should only contain allowed databases
  assert.deepStrictEqual(syncResult.syncedDatabases.sort(), ['allowed_existing', 'allowed_new']);
  assert.strictEqual(syncResult.totalDiscovered, 2);

  // Manager sub-connections should only contain allowed databases
  const summary = manager.listConnectionsSummary();
  const summaryDbs = summary[0].subConnections.map((s) => s.database).sort();
  assert.deepStrictEqual(summaryDbs, ['allowed_existing', 'allowed_new']);
}

console.log('✅ All Unit Tests Passed Successfully!');
