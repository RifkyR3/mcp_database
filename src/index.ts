#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadInitialConfig } from './config/config.js';
import { ConnectionManager } from './manager/connection-manager.js';
import { registerDatabaseTools } from './tools/index.js';

async function main() {
  const { configs, allowedDatabases } = loadInitialConfig();
  const manager = new ConnectionManager(configs, allowedDatabases);

  if (allowedDatabases && allowedDatabases.size > 0) {
    console.error(
      `[mcp-database-server] Server running in filtered mode. Allowed databases (${allowedDatabases.size}): [${Array.from(allowedDatabases).join(', ')}]`
    );
  }

  const server = new McpServer({
    name: 'mcp-database-server',
    version: '1.0.0',
  });

  registerDatabaseTools(server, manager);

  const transport = new StdioServerTransport();

  // Cleanup on exit
  const handleExit = async () => {
    try {
      await manager.closeAll();
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);

  await server.connect(transport);
  console.error('[mcp-database-server] Server started and listening on stdio.');
}

main().catch((err) => {
  console.error('[mcp-database-server] Fatal error:', err);
  process.exit(1);
});
