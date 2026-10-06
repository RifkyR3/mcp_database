# Security Policy

Data security and database integrity are our top priorities.

---

## 🔒 Recommended Security Practices

1. **Never Commit Real Credentials**:
   - Always refer to `connections.example.json` as a guide and store actual credentials in `connections.json`, which is included in `.gitignore`.
2. **Apply the Principle of Least Privilege**:
   - Create a dedicated database user for the MCP Server with limited permissions (e.g., `SELECT` only for read-only usage, or restricted to specific schemas).
3. **Leverage Write Rules**:
   - Apply `--write=false` or set `allowWrite: false` to block unwanted mutations from AI Agents.
   - Whitelist only strictly required operations via `writeExceptions` (e.g., `["INSERT", "UPDATE"]`).
4. **Isolate Databases**:
   - Use the `--databases` CLI flag or `ALLOWED_DATABASES` environment variable to restrict the AI Agent's scope exclusively to active project databases.

---

## 🚨 Reporting a Vulnerability

If you discover a security flaw or vulnerability within this project:
- **Do not** open a public issue on GitHub.
- Please contact the repository maintainers using GitHub's **Private Vulnerability Reporting** feature under the Security tab of this repository.

We will review and respond to your report as promptly as possible.
