# Changelog

All notable changes to the **MCP Database Server** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.2] - 2026-10-06

### Added
- **Strict Scope Enforcement for `ALLOWED_DATABASES`**:
  - `db_list_connections`: Only lists permitted databases and host servers that contain permitted databases. Sanitizes `defaultDatabase` and active connection pools so unallowed databases are never exposed. Adds `filteredMode` and `allowedDatabases` metadata to tool responses.
  - `db_discover_databases`: Filters discovered physical databases from host servers to strictly return permitted databases only.
  - `db_sync_databases` & `npm run sync`: Crawler strictly syncs and adds allowed databases; non-allowed database entries on disk are preserved safely to prevent accidental configuration data loss.
  - `resolveTarget`: Immediately rejects queries or connection attempts against restricted databases (`Access denied`). Sanitizes error messages so unallowed sub-connections are never leaked.
  - `db_register_sub_connection`: Prevents dynamic runtime registration of restricted databases when running in filtered mode.
  - Flexible `ALLOWED_DATABASES` parsing: Supports CLI flags (`--databases`, `--database`, `--dbs`, `--db`, `--filter`), environment variable formats (comma, semicolon, whitespace, JSON array `["db1", "db2"]`), and handles quoted values cleanly.
- **Auto-Populate Bare Main Connections**:
  - If a main connection has no pre-configured sub-connections, permitted databases are automatically mapped to that host.
- **Dedicated CLI Runner for `db_list_connections`**:
  - Added `npm run list` (`tsx src/list.ts`) script to inspect connections and test `ALLOWED_DATABASES` filter rules from the terminal with human-friendly and `--json` outputs.

### Changed
- **Sanitized Parameter Descriptions & Tests**:
  - Replaced internal/local database names with generic placeholders (`app_db`, `postgres_main`, `mysql_main`) across tool schema parameter descriptions and unit test fixtures.

---

## [1.0.1] - 2026-10-06

### Added
- **Release Packaging Assets**:
  - Included configuration templates (`connections.example.json`, `.env.example`) directly inside GitHub release archive packages (`.tar.gz` and `.zip`).
  - Added example configuration templates to the `files` array in `package.json` for npm package distributions.

### Changed
- **Installation Guide**:
  - Updated both `README.md` and `README.id.md` to highlight **Pre-built GitHub Release** as the primary/recommended installation method.
  - Restructured **Install from Source** as Method 2 for developers and contributors.
  - Added MCP client configuration example for globally linked CLI (`mcp-database`).

---

## [1.0.0] - 2026-10-05

### Added
- **Main & Sub Connection Architecture**:
  - Configure 1 host server (main connection) to manage multiple databases simultaneously (sub connections).
- **Dynamic Database Routing**:
  - Ability for MCP clients to query dynamically using alias IDs, composite strings (`mainId:database`), or explicit parameters.
- **Multiple Database Adapters**:
  - **PostgreSQL** adapter based on `pg.Pool` with automatic connection pooling.
  - **MySQL** adapter based on `mysql2/promise` with automatic connection pooling.
- **Write Rules & Write Exceptions**:
  - Tiered write protection (Sub Connection > Main Connection > Global).
  - Support for `allowWrite: false` with specific operation exemptions (e.g. `exceptions: ["INSERT", "UPDATE"]`).
  - SQL verb parser with literal string and comment stripping to prevent false positives and protect against multi-statement injections.
- **Database Crawling & Auto-Sync**:
  - `db_sync_databases` tool and `npm run sync` CLI command to discover physical databases on host servers and update configuration.
- **Database Scope Filtering**:
  - Restrict active databases via `--databases` CLI flag and `ALLOWED_DATABASES` environment variable for token efficiency and security.
- **Comprehensive MCP Tools**:
  - `db_list_connections`: View summary of all connections and active pools.
  - `db_discover_databases`: Discover all physical databases on the host.
  - `db_list_tables`: List tables and views in target databases.
  - `db_describe_table`: Inspect column structure, data types, nullability, and primary keys.
  - `db_execute_query`: Execute SQL queries with row pagination and write rule protection.
  - `db_test_connection`: Test database server connectivity.
  - `db_register_main_connection` & `db_register_sub_connection`: Register connections dynamically at runtime.
- **Documentation & Git Templates**:
  - `LICENSE` (MIT), `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`.
  - Secure configuration templates: `connections.example.json`, `mcp_config.example.json`, `.env.example`.
  - Comprehensive `.gitignore` to safeguard local credentials.
