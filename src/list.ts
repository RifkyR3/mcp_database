#!/usr/bin/env node

import { loadInitialConfig } from './config/config.js';
import { ConnectionManager } from './manager/connection-manager.js';

async function runList() {
  const args = process.argv.slice(2);
  const isJson = args.includes('--json') || args.includes('-j');

  const { configs, allowedDatabases } = loadInitialConfig();
  const manager = new ConnectionManager(configs, allowedDatabases);
  const connections = manager.listConnectionsSummary();

  if (isJson) {
    console.log(
      JSON.stringify(
        {
          count: connections.length,
          filteredMode: !!allowedDatabases,
          ...(allowedDatabases ? { allowedDatabases: Array.from(allowedDatabases) } : {}),
          connections,
        },
        null,
        2
      )
    );
    await manager.closeAll();
    return;
  }

  console.log('📋 MCP Database Connections Summary\n');
  if (allowedDatabases && allowedDatabases.size > 0) {
    console.log(`🔒 Filtered Mode Active: [${Array.from(allowedDatabases).join(', ')}]\n`);
  }

  if (connections.length === 0) {
    console.log('⚠️ No active or matching connections found.');
    console.log('💡 Check connections.json or adjust ALLOWED_DATABASES filter.\n');
    await manager.closeAll();
    return;
  }

  console.log(`Found ${connections.length} main connection(s):\n`);

  for (const conn of connections) {
    console.log(`📡 [${conn.mainId}] (${conn.engine.toUpperCase()})`);
    console.log(`   Host             : ${conn.host}:${conn.port || (conn.engine === 'postgres' ? 5432 : 3306)}`);
    console.log(`   User             : ${conn.user}`);
    if (conn.defaultDatabase) {
      console.log(`   Default Database : ${conn.defaultDatabase}`);
    }
    if (conn.description) {
      console.log(`   Description      : ${conn.description}`);
    }
    console.log(`   Sub-Databases    : ${conn.subConnections.length} database(s)`);

    for (const sub of conn.subConnections) {
      const aliasPart = sub.id !== sub.database ? ` (alias: "${sub.id}")` : '';
      const writePart = sub.readOnly ? ' [Read-Only]' : '';
      console.log(`      • ${sub.database}${aliasPart}${writePart}`);
    }
    console.log('');
  }

  await manager.closeAll();
}

runList().catch((err) => {
  console.error('Fatal error listing connections:', err);
  process.exit(1);
});
