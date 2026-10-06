#!/usr/bin/env node

import { loadInitialConfig, saveConfigFile } from './config/config.js';
import { ConnectionManager } from './manager/connection-manager.js';

async function runSync() {
  const args = process.argv.slice(2);
  const targetMainId = args[0]; // e.g. "postgres", "mysql56", or undefined for all
  const removeMissing = args.includes('--remove-missing');
  const includeSystem = args.includes('--include-system');

  console.log('🔍 Starting Database Crawler & Sync...\n');

  const { configs, allowedDatabases } = loadInitialConfig(false);
  if (configs.length === 0) {
    console.error('❌ No main connections configured in connections.json or environment.');
    process.exit(1);
  }

  if (allowedDatabases && allowedDatabases.size > 0) {
    console.log(`🔒 Filtered mode active: [${Array.from(allowedDatabases).join(', ')}]\n`);
  }

  const manager = new ConnectionManager(configs, allowedDatabases);
  const allMainConfigs = manager.getAllMainConfigs();

  const targets: string[] = [];
  if (targetMainId && targetMainId !== 'all' && !targetMainId.startsWith('--')) {
    if (!allMainConfigs.has(targetMainId)) {
      console.error(
        `❌ Main connection "${targetMainId}" not found. Available: [${Array.from(allMainConfigs.keys()).join(', ')}]`
      );
      await manager.closeAll();
      process.exit(1);
    }
    targets.push(targetMainId);
  } else {
    targets.push(...Array.from(allMainConfigs.keys()));
  }

  console.log(`Targeting main connection(s): [${targets.join(', ')}]`);

  for (const mainId of targets) {
    const config = allMainConfigs.get(mainId)!;
    console.log(`\n📡 Crawling [${mainId}] (${config.engine} @ ${config.host}:${config.port || (config.engine === 'postgres' ? 5432 : 3306)})...`);

    try {
      const result = await manager.crawlAndSyncDatabases(mainId, {
        includeSystemDatabases: includeSystem,
        removeMissing,
      });

      console.log(`   ✅ Found ${result.totalDiscovered} databases:`);
      console.log(`      - Added new: ${result.addedCount}`);
      console.log(`      - Existing preserved: ${result.existingCount}`);
      if (removeMissing) {
        console.log(`      - Removed missing: ${result.removedCount}`);
      }

      console.log('   📋 Databases:');
      for (const db of result.syncedDatabases) {
        console.log(`      • ${db}`);
      }
    } catch (err: any) {
      console.error(`   ❌ Failed to crawl [${mainId}]: ${err.message}`);
    }
  }

  // Save updated configurations back to connections.json
  saveConfigFile(allMainConfigs, allowedDatabases);
  console.log('\n💾 connections.json successfully updated!');

  await manager.closeAll();
  console.log('✨ Sync completed.\n');
}

runSync().catch((err) => {
  console.error('Fatal error during sync:', err);
  process.exit(1);
});
