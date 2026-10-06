# MCP Database Server (Node.js)

🌐 **Language**: **English** | [Bahasa Indonesia](README.id.md)

---

A Node.js & TypeScript MCP Server supporting **Multi-Database (PostgreSQL & MySQL)** environments with a **Main Connection & Sub Connection (Dynamic Routing)** architecture.

Replaces legacy setups that required multiple separate servers with **a single unified server** that is efficient, secure, and memory-friendly.

---

## 🌟 Key Features

1. **Main Connection**
   - Configure credentials once (host, port, user, password, ssl) for an entire database cluster / server.
2. **Sub Connection**
   - Register named databases hosted within that main server (e.g., `db_app`, `db_analytics`, `db_store`).
3. **Dynamic Connection (Automatic Routing)**
   - MCP Clients / AI Agents can flexibly target databases:
     - Using sub-connection alias IDs: `connectionId: "db_app"`
     - Composite format: `connectionId: "postgres_main:my_database"`
     - Or dynamically without prior registration: `mainId: "postgres_main"`, `database: "any_db_name"`
4. **Multiple Database Engines**
   - Supports **PostgreSQL** (via `pg.Pool`)
   - Supports **MySQL** (via `mysql2/promise`)
   - Adapter-based architecture (`DatabaseAdapter`), easily extensible to other engines (SQLite, MSSQL, etc.).
5. **Connection Pool Caching**
   - Connection pools are created lazily (on-demand) per database and cached for optimal performance without connection leaks.
6. **Write Rules & Exceptions (Data Mutation Security)**
   - Tiered write permissions: block mutations (`allowWrite: false`) with granular exceptions for specific operations (e.g., allow only `INSERT` & `UPDATE`).

---

## 🛠️ Available MCP Tools

| Tool Name | Description | Key Parameters |
| :--- | :--- | :--- |
| `db_list_connections` | List all main connections, sub-connections, and active pools | *None* |
| `db_discover_databases` | Discover all physical databases residing on the host server | `mainId` |
| `db_sync_databases` | **Crawl all databases from host servers & auto-update connections.json** | `mainId` (optional / 'all'), `removeMissing` |
| `db_list_tables` | List all tables & views in a specified database | `connectionId` or `mainId` + `database`, `schema` |
| `db_describe_table` | Inspect column structure, data types, nullability, primary keys | `tableName`, `connectionId` or `mainId` + `database` |
| `db_execute_query` | Execute SQL queries with parameterization & Write Rule protection | `query`, `connectionId` or `mainId` + `database`, `params`, `maxRows` |
| `db_test_connection` | Test connection status & retrieve database engine version | `connectionId` or `mainId` + `database` |
| `db_register_main_connection` | Dynamically add or update a main connection at runtime | `id`, `engine`, `host`, `port`, `user`, `password`, etc. |
| `db_register_sub_connection` | Dynamically register a new sub-connection alias | `mainId`, `id`, `database`, `readOnly` |

---

## 📦 Installation & Setup

### 1. Prerequisites
Ensure your environment meets the minimum requirements:
- **Node.js**: `>= 18.0.0`
- **npm**: `>= 9.0.0`
- Access to a **PostgreSQL** and/or **MySQL** database server.

### 2. Clone & Install Dependencies
Clone this repository and install all required dependencies:

```bash
git clone https://github.com/RifkyR3/mcp_database.git
cd mcp_database
npm install
```

### 3. Build the Project
Compile TypeScript source files into production-ready JavaScript (`dist/`):

```bash
npm run build
```

> **Tip:** You can also run the server directly in development mode without compiling by using `npm run dev`.

### 4. Setup Configuration
Copy the template configuration file to create your local `connections.json`:

```bash
# On Linux / macOS / Git Bash:
cp connections.example.json connections.json

# On Windows Command Prompt / PowerShell:
copy connections.example.json connections.json
```

*(Optional)* If you want to use environment variables for direct connections or global settings, copy `.env.example`:
```bash
# Linux / macOS / Git Bash:
cp .env.example .env

# Windows Command Prompt / PowerShell:
copy .env.example .env
```

### 5. (Optional) Global CLI Linking
To make the `mcp-database` command directly accessible anywhere on your system:
```bash
npm link
```

---

## 📁 Configuration Structure (`connections.json`)

Copy `connections.example.json` to `connections.json` and customize it with your database credentials:

```json
{
  "connections": {
    "postgres_main": {
      "id": "postgres_main",
      "engine": "postgres",
      "host": "localhost",
      "port": 5432,
      "user": "your_pg_user",
      "password": "your_pg_password",
      "defaultDatabase": "postgres",
      "description": "Primary PostgreSQL Server",
      "allowWrite": false,
      "writeExceptions": ["INSERT", "UPDATE"],
      "subConnections": [
        { 
          "id": "app_db", 
          "database": "my_application_db", 
          "description": "Main Application Database" 
        },
        { 
          "id": "analytics_db", 
          "database": "my_analytics_db", 
          "description": "Analytics Database (Read Only)",
          "allowWrite": false,
          "writeExceptions": []
        }
      ]
    },
    "mysql_cluster": {
      "id": "mysql_cluster",
      "engine": "mysql",
      "host": "localhost",
      "port": 3306,
      "user": "your_mysql_user",
      "password": "your_mysql_password",
      "defaultDatabase": "information_schema",
      "description": "MySQL Cluster Server",
      "subConnections": [
        { 
          "id": "store_db", 
          "database": "ecommerce_db", 
          "description": "E-commerce Database" 
        }
      ]
    }
  }
}
```

> **Security Note:** `connections.json` and `mcp_config.json` are excluded in `.gitignore` to prevent passwords and credentials from leaking publicly.

---

## 🚀 MCP Client Integration

In your MCP client configuration file (e.g., `mcp_config.json`, Claude Desktop config, or Antigravity config), add the server configuration:

```json
{
  "mcpServers": {
    "mcp_database": {
      "command": "node",
      "args": [
        "/path/to/mcp_database/dist/index.js"
      ],
      "env": {
        "MCP_DB_CONFIG_PATH": "/path/to/mcp_database/connections.json"
      }
    }
  }
}
```

Or using development mode with `tsx`:
```json
{
  "mcpServers": {
    "mcp_database": {
      "command": "npx",
      "args": [
        "-y",
        "tsx",
        "/path/to/mcp_database/src/index.ts"
      ],
      "env": {
        "MCP_DB_CONFIG_PATH": "/path/to/mcp_database/connections.json"
      }
    }
  }
}
```

---

## 🎯 Restricting Specific Databases from MCP Client

If `connections.json` contains multiple databases, but you only want to expose specific ones (e.g., only `app_db` and `store_db`), you can add CLI arguments or environment variables in your client configuration:

### Method 1: Using the `args` Parameter (Recommended)
```json
{
  "mcpServers": {
    "mcp_database": {
      "command": "node",
      "args": [
        "/path/to/mcp_database/dist/index.js",
        "--databases=app_db,store_db"
      ],
      "env": {
        "MCP_DB_CONFIG_PATH": "/path/to/mcp_database/connections.json"
      }
    }
  }
}
```

### Method 2: Using the `ALLOWED_DATABASES` Environment Variable
```json
{
  "mcpServers": {
    "mcp_database": {
      "command": "node",
      "args": [
        "/path/to/mcp_database/dist/index.js"
      ],
      "env": {
        "MCP_DB_CONFIG_PATH": "/path/to/mcp_database/connections.json",
        "ALLOWED_DATABASES": "app_db,store_db"
      }
    }
  }
}
```

**Benefits of filtering:**
- AI Agents / MCP Clients only see the databases you permit (saving context window tokens).
- Other databases outside the allowed list are automatically protected and query execution is rejected.
- Corresponding main connection credentials are still automatically resolved.

---

## 🔒 Write Rules & Write Exceptions (Database Mutation Protection)

This feature allows you to configure data mutation permissions (`allowWrite`) and SQL operation exceptions (`writeExceptions`).

### 💡 How It Works:
- **`allowWrite: false` (write = false)**:
  All SQL mutation operations (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`, `ALTER`, etc.) will be **BLOCKED**.
  Read queries (`SELECT`, `SHOW`, `DESCRIBE`, `EXPLAIN`) remain **ALLOWED**.
- **`writeExceptions: ["INSERT", "UPDATE"]` (Exceptions)**:
  When `allowWrite: false`, operations specified in the exceptions list (e.g. `INSERT` and `UPDATE`) are **STILL ALLOWED**, while destructive operations like `DELETE`, `DROP`, `TRUNCATE`, `ALTER` remain **BLOCKED**.
- Conversely, if `allowWrite: true` (default), you can set `writeExceptions: ["DROP", "TRUNCATE"]` to selectively block those dangerous operations.

---

### ⚙️ How to Configure Write Rules

Rules can be configured across 3 hierarchical levels (priority order: **Sub-Connection > Main Connection > Global**):

#### 1. Sub-Connection Level (Per Database in `connections.json`)
```json
{
  "id": "app_db",
  "database": "my_application_db",
  "allowWrite": false,
  "writeExceptions": ["INSERT", "UPDATE"]
}
```
*(Only the `app_db` database enforces this rule: INSERT & UPDATE allowed, DELETE & DROP blocked).*

#### 2. Main Connection Level (Per Host Server in `connections.json`)
```json
{
  "postgres_main": {
    "id": "postgres_main",
    "engine": "postgres",
    "host": "localhost",
    "port": 5432,
    "user": "your_user",
    "password": "your_password",
    "allowWrite": false,
    "writeExceptions": ["INSERT", "UPDATE"]
  }
}
```

#### 3. Global Level (in `mcp_config.json`)
Can be configured directly in `mcp_config.json` via CLI arguments:
```json
{
  "mcpServers": {
    "mcp_database": {
      "command": "node",
      "args": [
        "/path/to/mcp_database/dist/index.js",
        "--databases=app_db,store_db",
        "--write=false",
        "--write-exceptions=INSERT,UPDATE"
      ],
      "env": {
        "MCP_DB_CONFIG_PATH": "/path/to/mcp_database/connections.json"
      }
    }
  }
}
```

---

## 🔄 Automated Database Crawl & Synchronization

You can crawl all databases on host servers and update `connections.json` automatically using two methods:

### 1. Via Terminal / CLI
```bash
# Sync all main connections
npm run sync

# Or sync a specific main connection
npm run sync postgres_main
npm run sync mysql_cluster
```

### 2. Via MCP Tool
Invoke the `db_sync_databases` tool from your MCP client / AI Agent with parameters:
```json
{
  "mainId": "all",
  "removeMissing": false
}
```

---

## 🧪 Testing & Verification

This project includes test scripts:

```bash
# 1. Test database connectivity
npm test

# 2. Test Write Rules & Write Exceptions
npm run test:write
```

---

## 📄 License
MIT License
