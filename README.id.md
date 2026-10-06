# MCP Database Server (Node.js)

🌐 **Bahasa**: [English](README.md) | **Bahasa Indonesia**

---

MCP Server berbasis Node.js & TypeScript yang mendukung **Multi-Database (PostgreSQL & MySQL)** dengan arsitektur **Main Connection & Sub Connection (Dynamic Routing)**.

Menggantikan setup lama yang membutuhkan banyak server terpisah menjadi **hanya 1 server tunggal** yang efisien, aman, dan hemat memori.

---

## 🌟 Fitur Utama

1. **Main Connection**
   - Cukup setup 1 konfigurasi kredensial (host, port, user, password, ssl) untuk satu cluster / server database.
2. **Sub Connection**
   - Mendaftarkan daftar nama database yang berada di dalam server main tersebut (misal: `db_app`, `db_analytics`, `db_store`).
3. **Dynamic Connection (Routing Otomatis)**
   - MCP Client / AI Agent bebas memilih database dengan fleksibel:
     - Menggunakan alias ID sub-connection: `connectionId: "db_app"`
     - Format komposit: `connectionId: "postgres_main:my_database"`
     - Atau dinamis tanpa pre-konfigurasi: `mainId: "postgres_main"`, `database: "nama_db_apapun"`
4. **Multiple Database Engine**
   - Mendukung **PostgreSQL** (via `pg.Pool`)
   - Mendukung **MySQL** (via `mysql2/promise`)
   - Arsitektur berbasis adapter (`DatabaseAdapter`), mudah ditambah engine lain (SQLite, MSSQL, dll).
5. **Connection Pool Caching**
   - Pool koneksi dibuat secara lazy (on-demand) per database dan disimpan dalam cache, sehingga performa cepat tanpa kebocoran resource.
6. **Write Rules & Exceptions (Keamanan Mutasi Data)**
   - Aturan izin penulisan bertingkat: blokir mutasi (`allowWrite: false`) dengan pengecualian operasi tertentu (misal: hanya izinkan `INSERT` & `UPDATE`).

---

## 🛠️ MCP Tools yang Disediakan

| Tool Name | Deskripsi | Parameter Utama |
| :--- | :--- | :--- |
| `db_list_connections` | Melihat semua main connection, sub-connection, dan pool aktif | *None* |
| `db_discover_databases` | Mendeteksi semua database fisik yang ada di server host | `mainId` |
| `db_sync_databases` | **Crawl semua database dari server & update otomatis ke connections.json** | `mainId` (opsional / 'all'), `removeMissing` |
| `db_list_tables` | Menampilkan semua tabel & view di database tertentu | `connectionId` atau `mainId` + `database`, `schema` |
| `db_describe_table` | Menampilkan struktur kolom, tipe data, nullable, primary key | `tableName`, `connectionId` atau `mainId` + `database` |
| `db_execute_query` | Mengeksekusi query SQL dengan parameter & proteksi Write Rule | `query`, `connectionId` atau `mainId` + `database`, `params`, `maxRows` |
| `db_test_connection` | Menguji status koneksi & mengambil versi database engine | `connectionId` atau `mainId` + `database` |
| `db_register_main_connection` | Menambahkan / mengubah main connection secara dinamis saat runtime | `id`, `engine`, `host`, `port`, `user`, `password`, dll |
| `db_register_sub_connection` | Mendaftarkan alias sub-connection baru secara dinamis | `mainId`, `id`, `database`, `readOnly` |

---

## 📦 Instalasi & Persiapan

### 1. Prasyarat Sistem
Pastikan lingkungan Anda memenuhi spesifikasi minimum:
- **Node.js**: Versi `>= 18.0.0`
- **npm**: Versi `>= 9.0.0`
- Akses ke server database **PostgreSQL** dan/atau **MySQL**.

### 2. Clone Repository & Pasang Dependensi
Clone repository ini lalu pasang seluruh dependensi proyek:

```bash
git clone https://github.com/RifkyR3/mcp_database.git
cd mcp_database
npm install
```

### 3. Build Proyek
Kompilasi kode sumber TypeScript ke JavaScript siap pakai (`dist/`):

```bash
npm run build
```

> **Tip:** Anda juga dapat langsung menjalankan server dalam mode pengembangan tanpa perlu build: `npm run dev`.

### 4. Siapkan File Konfigurasi
Salin file template konfigurasi untuk membuat file `connections.json` lokal Anda:

```bash
# Di Linux / macOS / Git Bash:
cp connections.example.json connections.json

# Di Windows Command Prompt / PowerShell:
copy connections.example.json connections.json
```

*(Opsional)* Jika Anda ingin menggunakan environment variable untuk koneksi langsung atau konfigurasi global, salin juga `.env.example`:
```bash
# Di Linux / macOS / Git Bash:
cp .env.example .env

# Di Windows Command Prompt / PowerShell:
copy .env.example .env
```

### 5. (Opsional) Link CLI Global
Untuk menjadikan perintah `mcp-database` dapat langsung dipanggil di mana saja secara global:
```bash
npm link
```

---

## 📁 Struktur Konfigurasi (`connections.json`)

Salin file `connections.example.json` menjadi `connections.json` lalu sesuaikan dengan kredensial database Anda:

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
      "description": "Server PostgreSQL Utama",
      "allowWrite": false,
      "writeExceptions": ["INSERT", "UPDATE"],
      "subConnections": [
        { 
          "id": "app_db", 
          "database": "my_application_db", 
          "description": "Database Aplikasi Utama" 
        },
        { 
          "id": "analytics_db", 
          "database": "my_analytics_db", 
          "description": "Database Analitik (Read Only)",
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
      "description": "Server MySQL Cluster",
      "subConnections": [
        { 
          "id": "store_db", 
          "database": "ecommerce_db", 
          "description": "Database E-commerce" 
        }
      ]
    }
  }
}
```

> **Catatan Keamanan:** File `connections.json` dan `mcp_config.json` sudah diabaikan di `.gitignore` agar password dan kredensial Anda tidak bocor ke publik.

---

## 🚀 Cara Integrasi ke MCP Client

Di file konfigurasi MCP Anda (misal `mcp_config.json`, Claude Desktop config, atau Antigravity config), tambahkan konfigurasi server:

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

Atau menggunakan mode development dengan `tsx`:
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

## 🎯 Membatasi Spesifik Database Tertentu dari MCP Client

Jika `connections.json` memiliki banyak database, namun Anda hanya ingin mengekspos database tertentu saja (misal hanya `app_db` dan `store_db`), Anda dapat menambahkan argumen atau environment variable di konfigurasi client:

### Cara 1: Menggunakan Parameter `args` (Rekomendasi)
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

### Cara 2: Menggunakan Environment Variable `ALLOWED_DATABASES`
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

**Keuntungan mode filter:**
- AI Agent / MCP Client hanya melihat database yang Anda izinkan (menghemat token context).
- Database lain di luar daftar otomatis terproteksi dan diblokir dari eksekusi query.
- Main connection yang sesuai tetap otomatis digunakan.

---

## 🔒 Write Rules & Write Exceptions (Proteksi Mutasi Database)

Fitur ini memungkinkan Anda mengatur izin mutasi data (`allowWrite`) dan pengecualian operasi SQL (`writeExceptions`).

### 💡 Konsep Kerja:
- **`allowWrite: false` (write = false)**:
  Semua operasi mutasi SQL (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`, `ALTER`, dll.) akan **DIBLOKIR**.
  Query pembacaan (`SELECT`, `SHOW`, `DESCRIBE`, `EXPLAIN`) tetap **DIIZINKAN**.
- **`writeExceptions: ["INSERT", "UPDATE"]` (Pengecualian)**:
  Jika `allowWrite: false`, maka operasi yang didaftarkan di exceptions (misal `INSERT` dan `UPDATE`) **TETAP DIIZINKAN**, sementara operasi destruktif seperti `DELETE`, `DROP`, `TRUNCATE`, `ALTER` **TETAP DIBLOKIR**.
- Sebaliknya jika `allowWrite: true` (default), Anda bisa mengisi `writeExceptions: ["DROP", "TRUNCATE"]` untuk secara spesifik memblokir operasi berbahaya tersebut.

---

### ⚙️ Cara Konfigurasi Write Rules

Aturan ini dapat dikonfigurasi di 3 level hierarki (prioritas: **Sub-Connection > Main Connection > Global**):

#### 1. Level Sub-Connection (Per Database di `connections.json`)
```json
{
  "id": "app_db",
  "database": "my_application_db",
  "allowWrite": false,
  "writeExceptions": ["INSERT", "UPDATE"]
}
```
*(Hanya database `app_db` yang menerapkan aturan: INSERT & UPDATE boleh, DELETE & DROP diblokir).*

#### 2. Level Main Connection (Satu Server Host di `connections.json`)
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

#### 3. Level Global (di `mcp_config.json`)
Dapat dipasang langsung di `mcp_config.json` melalui argumen CLI:
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

## 🔄 Crawl & Sinkronisasi Database Otomatis

Anda dapat melakukan crawl semua database di server host dan memperbarui `connections.json` secara otomatis menggunakan dua cara:

### 1. Lewat Terminal / CLI
```bash
# Sinkronkan semua main connection
npm run sync

# Atau sinkronkan spesifik untuk satu main connection saja
npm run sync postgres_main
npm run sync mysql_cluster
```

### 2. Lewat MCP Tool
Panggil tool `db_sync_databases` dari MCP client / AI Agent dengan parameter:
```json
{
  "mainId": "all",
  "removeMissing": false
}
```

---

## 🧪 Testing & Verifikasi

Proyek ini telah dilengkapi dengan script pengujian:

```bash
# 1. Tes konektivitas database
npm test

# 2. Tes Write Rules & Write Exceptions
npm run test:write
```

---

## 📄 Lisensi
MIT License
