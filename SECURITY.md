# Kebijakan Keamanan (Security Policy)

Keamanan data dan integritas database Anda adalah prioritas utama kami.

---

## 🔒 Praktik Keamanan Rekomendasi

1. **Jangan Pernah Meng-commit Kredensial Asli**:
   - Selalu gunakan `connections.example.json` sebagai panduan dan simpan kredensial asli di `connections.json` yang telah masuk dalam daftar `.gitignore`.
2. **Gunakan Hak Akses Minimal (Principle of Least Privilege)**:
   - Buat user database khusus untuk MCP Server dengan izin terbatas (misal hanya `SELECT` untuk read-only, atau batasi schema tertentu).
3. **Manfaatkan Fitur Write Rules**:
   - Pasang `--write=false` atau `allowWrite: false` untuk memblokir mutasi yang tidak diinginkan oleh AI Agent.
   - Izinkan hanya operasi yang benar-benar dibutuhkan melalui `writeExceptions` (misal: `["INSERT", "UPDATE"]`).
4. **Isolasi Database**:
   - Gunakan parameter `--databases` atau variabel lingkungan `ALLOWED_DATABASES` untuk membatasi AI Agent agar hanya bisa mengakses database proyek yang sedang aktif.

---

## 🚨 Melaporkan Kerentanan (Reporting a Vulnerability)

Jika Anda menemukan celah keamanan atau kerentanan dalam proyek ini:
- **Jangan** membuat issue publik di GitHub.
- Silakan hubungi pemelihara repository melalui fitur **Private Vulnerability Reporting** di tab Security GitHub repository ini.

Kami akan merespons dan meninjau laporan Anda sesegera mungkin.
