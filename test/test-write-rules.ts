import { loadInitialConfig } from '../src/config/config.js';
import { ConnectionManager } from '../src/manager/connection-manager.js';
import { validateQueryAgainstWriteRule } from '../src/security/write-rules.js';

async function runWriteRulesOnCoba() {
  console.log('🧪 PENGUJIAN WRITE RULES & EXCEPTIONS PADA DATABASE `coba`\n');

  // Load konfigurasi tanpa filter global
  const { configs } = loadInitialConfig(false);

  // Hanya perbolehkan database 'coba' (keamanan: tidak menyentuh database lain)
  const allowedDatabases = new Set(['coba']);

  // Aturan yang diuji: write = false (blokir mutasi), KECUALI insert & update
  const testWriteRule = {
    allow: false,
    exceptions: ['INSERT', 'UPDATE'],
  };

  const manager = new ConnectionManager(configs, allowedDatabases, testWriteRule);

  const targets = [
    { mainId: 'postgres', database: 'coba', label: 'PostgreSQL (localhost:5432) -> DB: coba' },
    { mainId: 'mysql56', database: 'coba', label: 'MySQL 5.6 (localhost:3356) -> DB: coba' },
  ];

  let totalPassed = 0;
  let totalTests = 0;

  for (const t of targets) {
    console.log(`======================================================================`);
    console.log(`📡 TARGET: [${t.label}]`);
    console.log(`   Tabel Target : table_coba`);
    console.log(`   Aturan Uji   : write = false, exceptions = ["INSERT", "UPDATE"]`);
    console.log(`======================================================================`);

    let adapter: any;
    let targetInfo: any;

    try {
      const conn = await manager.getAdapter({
        mainId: t.mainId,
        database: t.database,
      });
      adapter = conn.adapter;
      targetInfo = conn.target;
      console.log(`✅ Berhasil terhubung ke database "${t.database}" pada "${t.mainId}"`);
    } catch (err: any) {
      console.error(`❌ Gagal terhubung ke [${t.label}]: ${err.message}\n`);
      continue;
    }

    const tableName = 'table_coba';

    // Helper pengujian write rules
    const testQuery = async (
      sql: string,
      operationName: string,
      expectedAllowedByRule: boolean,
      explanation: string
    ) => {
      totalTests++;
      console.log(`\n▶ [Uji ${totalTests}] Operasi: ${operationName}`);
      console.log(`   Deskripsi    : ${explanation}`);
      console.log(`   SQL Query    : "${sql}"`);

      // 1. Validasi aturan Write Rule pada layer MCP Server
      const validation = validateQueryAgainstWriteRule(
        sql,
        targetInfo.effectiveWriteRule,
        targetInfo.database
      );

      if (!validation.allowed) {
        if (!expectedAllowedByRule) {
          console.log(`   ✅ VALIDASI ATURAN : BERHASIL DIBLOKIR OLEH MCP SERVER`);
          console.log(`   🛡️ Alasan Penolakan : ${validation.reason}`);
          console.log(`   🔒 Status DB        : Aman (Query tidak pernah dikirim ke database)`);
          totalPassed++;
          return;
        } else {
          console.log(`   ❌ VALIDASI ATURAN : GAGAL (Seharusnya diizinkan tapi diblokir!)`);
          console.log(`   Pesan               : ${validation.reason}`);
          return;
        }
      }

      // 2. Jika diizinkan oleh write rule
      if (!expectedAllowedByRule) {
        console.log(`   ❌ VALIDASI ATURAN : GAGAL (Seharusnya diblokir tapi lolos validasi!)`);
        return;
      }

      console.log(`   ✅ VALIDASI ATURAN : DIIZINKAN (Lolos filter Write Rule)`);
      totalPassed++;

      // 3. Eksekusi query ke database asli
      try {
        const queryRes = await adapter.query(sql);
        console.log(`   📡 Eksekusi DB     : Berhasil dieksekusi (${queryRes.executionTimeMs}ms)`);
        if (queryRes.rows && queryRes.rows.length >= 0) {
          console.log(`   📄 Data DB         : ${queryRes.rows.length} baris`);
        }
      } catch (dbErr: any) {
        // Catatan: user database 'mcp' di DBMS memiliki hak akses SELECT/SHOW VIEW
        console.log(`   ℹ️ Catatan DB       : DBMS response -> ${dbErr.message}`);
      }
    };

    // --- SKENARIO PENGUJIAN ---

    // 1. SELECT (harus lolos validasi & dieksekusi)
    await testQuery(
      `SELECT * FROM ${tableName};`,
      'SELECT',
      true,
      'Operasi pembacaan data (Read-only, selalu DIIZINKAN)'
    );

    // 2. INSERT (harus lolos validasi karena ada di exceptions)
    await testQuery(
      `INSERT INTO ${tableName} (id, name) VALUES (101, 'Testing Write Exception');`,
      'INSERT',
      true,
      'Operasi INSERT (Terdaftar di writeExceptions, harus DIIZINKAN oleh MCP Server)'
    );

    // 3. UPDATE (harus lolos validasi karena ada di exceptions)
    await testQuery(
      `UPDATE ${tableName} SET name = 'Updated Name' WHERE id = 101;`,
      'UPDATE',
      true,
      'Operasi UPDATE (Terdaftar di writeExceptions, harus DIIZINKAN oleh MCP Server)'
    );

    // 4. DELETE (harus diblokir sebelum mencapai database)
    await testQuery(
      `DELETE FROM ${tableName} WHERE id = 101;`,
      'DELETE',
      false,
      'Operasi DELETE (Bukan exception, harus DIBLOKIR oleh Write Rule)'
    );

    // 5. DROP TABLE (harus diblokir sebelum mencapai database)
    await testQuery(
      `DROP TABLE ${tableName};`,
      'DROP TABLE',
      false,
      'Operasi DROP TABLE (Bukan exception, harus DIBLOKIR oleh Write Rule)'
    );

    // 6. TRUNCATE TABLE (harus diblokir sebelum mencapai database)
    await testQuery(
      `TRUNCATE TABLE ${tableName};`,
      'TRUNCATE TABLE',
      false,
      'Operasi TRUNCATE TABLE (Bukan exception, harus DIBLOKIR oleh Write Rule)'
    );

    console.log(`\nSelesai pengujian pada [${t.label}].\n`);
  }

  await manager.closeAll();

  console.log(`======================================================================`);
  console.log(`📊 RINGKASAN PENGUJIAN WRITE RULES DI DATABASE \`coba\`:`);
  console.log(`   Total Pengujian : ${totalTests}`);
  console.log(`   Berhasil Lolos  : ${totalPassed}`);
  console.log(`   Gagal           : ${totalTests - totalPassed}`);
  console.log(`======================================================================`);

  if (totalPassed === totalTests && totalTests > 0) {
    console.log('🎉 SEMUA PENGUJIAN WRITE RULES & EXCEPTIONS 100% SUKSES!\n');
    process.exit(0);
  } else {
    console.error('❌ ADA PENGUJIAN YANG GAGAL!\n');
    process.exit(1);
  }
}

runWriteRulesOnCoba().catch((err) => {
  console.error('Fatal error during test:', err);
  process.exit(1);
});
