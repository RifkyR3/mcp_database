import { loadInitialConfig } from '../src/config/config.js';
import { ConnectionManager } from '../src/manager/connection-manager.js';

async function runTest() {
  console.log('Testing MCP Database Connection Manager...\n');
  const { configs, allowedDatabases } = loadInitialConfig();
  console.log(`Loaded ${configs.length} main configurations.`);

  if (configs.length === 0) {
    console.log('No configurations found. Copy connections.example.json to connections.json to test.');
    return;
  }

  const manager = new ConnectionManager(configs, allowedDatabases);
  const summary = manager.listConnectionsSummary();

  console.log('Summary of configured connections:');
  for (const s of summary) {
    console.log(`- Main: [${s.mainId}] Engine: ${s.engine} @ ${s.host}:${s.port} (${s.subConnections.length} sub-dbs)`);
  }

  for (const s of summary) {
    console.log(`\nTesting connection to [${s.mainId}] (${s.engine})...`);
    try {
      const targetDb = s.subConnections[0]?.database || s.defaultDatabase;
      if (!targetDb) {
        console.log(`  Skipped: no sub-database configured for ${s.mainId}`);
        continue;
      }
      const { adapter, target } = await manager.getAdapter({
        mainId: s.mainId,
        database: targetDb,
      });
      const testResult = await adapter.testConnection();
      console.log(`  Result for "${target.database}":`, testResult.ok ? '✅ Connected' : '❌ Failed');
      if (testResult.version) {
        console.log(`  Version: ${testResult.version}`);
      }
    } catch (err: any) {
      console.error(`  Error: ${err.message}`);
    }
  }

  await manager.closeAll();
  console.log('\nAll connection tests completed.');
}

runTest().catch(console.error);
