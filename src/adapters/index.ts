import { MainConnectionConfig } from '../config/types.js';
import { DatabaseAdapter } from './adapter.interface.js';
import { PostgresAdapter } from './postgres.adapter.js';
import { MysqlAdapter } from './mysql.adapter.js';

export function createDatabaseAdapter(
  mainConfig: MainConnectionConfig,
  database: string
): DatabaseAdapter {
  switch (mainConfig.engine.toLowerCase()) {
    case 'postgres':
    case 'postgresql':
    case 'pg':
      return new PostgresAdapter(mainConfig, database);

    case 'mysql':
    case 'mariadb':
      return new MysqlAdapter(mainConfig, database);

    default:
      throw new Error(
        `Unsupported database engine: "${mainConfig.engine}". Supported engines: postgres, mysql`
      );
  }
}

export * from './adapter.interface.js';
export * from './postgres.adapter.js';
export * from './mysql.adapter.js';
