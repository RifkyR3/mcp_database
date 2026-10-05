import { MainConnectionConfig, SubConnectionConfig, WriteRuleConfig } from '../config/types.js';

const SAFE_READ_OPERATIONS = new Set([
  'SELECT',
  'SHOW',
  'DESCRIBE',
  'DESC',
  'EXPLAIN',
  'PRAGMA',
  'SET',
  'USE',
]);

const KNOWN_WRITE_OPERATIONS = new Set([
  'INSERT',
  'UPDATE',
  'DELETE',
  'REPLACE',
  'UPSERT',
  'MERGE',
  'DROP',
  'TRUNCATE',
  'ALTER',
  'CREATE',
  'RENAME',
  'GRANT',
  'REVOKE',
  'LOCK',
  'CALL',
  'DO',
]);

/**
 * Strips comments and string literals from SQL query to avoid false positives
 */
export function sanitizeSql(sql: string): string {
  let cleaned = sql;

  // 1. Remove block comments /* ... */
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, ' ');

  // 2. Remove single line comments (-- or #)
  cleaned = cleaned.replace(/(--|#)[^\r\n]*/g, ' ');

  // 3. Remove string literals: '...', "...", `...`, and dollar-quoted strings $tag$...$tag$
  cleaned = cleaned.replace(/'(?:[^'\\]|\\.)*'/g, "''");
  cleaned = cleaned.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  cleaned = cleaned.replace(/`(?:[^`\\]|\\.)*`/g, '``');
  cleaned = cleaned.replace(/\$([a-zA-Z0-9_]*)\$[\s\S]*?\$\1\$/g, ' ');

  return cleaned.trim();
}

/**
 * Extracts all primary SQL command verbs from a query (including multi-statements)
 */
export function extractSqlOperations(sql: string): string[] {
  const sanitized = sanitizeSql(sql);
  if (!sanitized) return ['SELECT'];

  // Split by semicolon for multi-statements
  const statements = sanitized
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  const operations: string[] = [];

  for (const stmt of statements) {
    // Check CTE (WITH ... SELECT/INSERT/UPDATE/DELETE)
    let processed = stmt;
    if (/^WITH\b/i.test(processed)) {
      // Find the main statement after the CTE definitions
      const match = processed.match(/\)\s*(SELECT|INSERT|UPDATE|DELETE|REPLACE|MERGE)\b/i);
      if (match && match[1]) {
        operations.push(match[1].toUpperCase());
        continue;
      }
    }

    // Extract first keyword/word
    const match = processed.match(/^([a-zA-Z_]+)/);
    if (match) {
      operations.push(match[1].toUpperCase());
    }
  }

  return operations.length > 0 ? operations : ['UNKNOWN'];
}

/**
 * Parses global write rules from CLI arguments or Environment variables
 */
export function parseGlobalWriteRule(): WriteRuleConfig {
  const rule: WriteRuleConfig = {};

  // Check CLI arguments
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--read-only') {
      rule.allow = false;
    } else if (arg.startsWith('--write=') || arg.startsWith('--allow-write=')) {
      const val = arg.split('=')[1].toLowerCase();
      rule.allow = val === 'true' || val === '1';
    } else if (arg.startsWith('--write-exceptions=')) {
      const val = arg.split('=')[1];
      rule.exceptions = val.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    }
  }

  // Check Environment variables
  if (process.env.WRITE_ALLOW !== undefined || process.env.WRITE_RULE_ALLOW !== undefined) {
    const val = (process.env.WRITE_ALLOW || process.env.WRITE_RULE_ALLOW || '').toLowerCase();
    rule.allow = val === 'true' || val === '1';
  } else if (process.env.READ_ONLY === 'true' || process.env.READ_ONLY === '1') {
    rule.allow = false;
  }

  const envExceptions = process.env.WRITE_EXCEPTIONS || process.env.WRITE_RULE_EXCEPTIONS;
  if (envExceptions) {
    rule.exceptions = envExceptions.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  }

  return rule;
}

/**
 * Resolves the effective write rule cascading from SubConnection -> MainConnection -> Global
 */
export function resolveEffectiveWriteRule(
  globalRule: WriteRuleConfig,
  mainConfig?: MainConnectionConfig,
  subConfig?: SubConnectionConfig
): WriteRuleConfig {
  // 1. Sub connection level
  if (subConfig) {
    if (subConfig.writeRule) {
      return normalizeWriteRule(subConfig.writeRule);
    }
    if (subConfig.allowWrite !== undefined || subConfig.writeExceptions !== undefined) {
      return {
        allow: subConfig.allowWrite ?? true,
        exceptions: (subConfig.writeExceptions || []).map((e) => e.toUpperCase()),
      };
    }
    if (subConfig.readOnly !== undefined) {
      return {
        allow: !subConfig.readOnly,
        exceptions: [],
      };
    }
  }

  // 2. Main connection level
  if (mainConfig) {
    if (mainConfig.writeRule) {
      return normalizeWriteRule(mainConfig.writeRule);
    }
    if (mainConfig.allowWrite !== undefined || mainConfig.writeExceptions !== undefined) {
      return {
        allow: mainConfig.allowWrite ?? true,
        exceptions: (mainConfig.writeExceptions || []).map((e) => e.toUpperCase()),
      };
    }
  }

  // 3. Global level
  if (globalRule.allow !== undefined || (globalRule.exceptions && globalRule.exceptions.length > 0)) {
    return normalizeWriteRule(globalRule);
  }

  // Default: allow all write operations
  return { allow: true, exceptions: [] };
}

function normalizeWriteRule(rule: WriteRuleConfig): WriteRuleConfig {
  return {
    allow: rule.allow ?? true,
    exceptions: (rule.exceptions || []).map((e) => e.trim().toUpperCase()),
  };
}

/**
 * Validates whether the given SQL query conforms to the write rule
 */
export function validateQueryAgainstWriteRule(
  sql: string,
  rule: WriteRuleConfig,
  database: string
): { allowed: boolean; reason?: string; operations: string[] } {
  const operations = extractSqlOperations(sql);
  const allow = rule.allow ?? true;
  const exceptions = new Set((rule.exceptions || []).map((e) => e.toUpperCase()));

  for (const op of operations) {
    // Read operations are always safe
    if (SAFE_READ_OPERATIONS.has(op)) {
      continue;
    }

    if (!allow) {
      // Write is disabled by default. ONLY operations in exceptions are permitted!
      if (!exceptions.has(op)) {
        const allowedList = exceptions.size > 0 ? Array.from(exceptions).join(', ') : 'none';
        return {
          allowed: false,
          reason:
            `Write operation "${op}" is forbidden on database "${database}". ` +
            `(write = false; allowed exceptions: [${allowedList}])`,
          operations,
        };
      }
    } else {
      // Write is enabled by default. If exceptions are defined, those operations are forbidden!
      if (exceptions.has(op)) {
        return {
          allowed: false,
          reason:
            `Operation "${op}" is explicitly forbidden by write rule exception on database "${database}". ` +
            `(Forbidden operations: [${Array.from(exceptions).join(', ')}])`,
          operations,
        };
      }
    }
  }

  return { allowed: true, operations };
}
