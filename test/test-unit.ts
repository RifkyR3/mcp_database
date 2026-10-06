import assert from 'node:assert';
import {
  sanitizeSql,
  extractSqlOperations,
  validateQueryAgainstWriteRule,
  resolveEffectiveWriteRule,
} from '../src/security/write-rules.js';

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

console.log('✅ All Unit Tests Passed Successfully!');
