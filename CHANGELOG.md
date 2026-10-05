# Changelog

Semua perubahan penting pada proyek **MCP Database Server** akan didokumentasikan dalam file ini.

Format changelog ini mengacu pada [Keep a Changelog](https://keepachangelog.com/id/1.0.0/) dan menerapkan prinsip [Semantic Versioning](https://semver.org/).

---

## [1.0.0] - 2026-10-05

### Added
- **Arsitektur Main & Sub Connection**:
  - Konfigurasi 1 server host (main connection) untuk mengelola banyak database sekaligus (sub connections).
- **Dynamic Database Routing**:
  - Kemampuan client MCP untuk query dinamis menggunakan alias ID, format komposit (`mainId:database`), atau parameter eksplisit.
- **Multiple Database Adapters**:
  - Adapter **PostgreSQL** berbasis `pg.Pool` dengan connection pooling otomatis.
  - Adapter **MySQL** berbasis `mysql2/promise` dengan connection pooling otomatis.
- **Write Rules & Write Exceptions**:
  - Proteksi penulisan bertingkat (Sub Connection > Main Connection > Global).
  - Dukungan `allowWrite: false` dengan pengecualian operasi tertentu (misal: `exceptions: ["INSERT", "UPDATE"]`).
  - Parser SQL verb yang membersihkan string literal dan komentar untuk mencegah false-positive serta proteksi injeksi multi-statement.
- **Database Crawling & Auto-Sync**:
  - Tool `db_sync_databases` dan CLI command `npm run sync` untuk mendeteksi database fisik di server host dan menyimpannya ke konfigurasi.
- **Database Scope Filtering**:
  - Pembatasan database aktif via parameter `--databases` dan environment variable `ALLOWED_DATABASES` untuk efisiensi token dan keamanan.
- **Tool MCP Komprehensif**:
  - `db_list_connections`: Melihat ringkasan semua koneksi dan pool aktif.
  - `db_discover_databases`: Menelusuri semua database fisik pada host.
  - `db_list_tables`: Menampilkan tabel & view di database target.
  - `db_describe_table`: Struktur kolom, tipe data, nullable, dan primary key.
  - `db_execute_query`: Eksekusi SQL dengan paginasi baris dan proteksi write rule.
  - `db_test_connection`: Pengujian konektivitas server database.
  - `db_register_main_connection` & `db_register_sub_connection`: Registrasi koneksi dinamis saat runtime.
- **Dokumentasi & Template Git**:
  - `LICENSE` (MIT), `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`.
  - Template konfigurasi aman: `connections.example.json`, `mcp_config.example.json`, `.env.example`.
  - `.gitignore` komprehensif untuk melindungi kredensial lokal.
