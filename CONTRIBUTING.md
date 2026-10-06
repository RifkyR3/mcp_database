# Contributing Guide

🌐 **Language**: **English** | [Bahasa Indonesia](CONTRIBUTING.id.md)

---

Thank you for your interest in contributing to **MCP Database Server**!

---

## 🛠️ Local Development Workflow

### 1. Prerequisites
- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- A local or remote database server (PostgreSQL / MySQL) for testing.

### 2. Dependency Installation
```bash
git clone https://github.com/username/mcp-database-server.git
cd mcp-database-server
npm install
```

### 3. Environment Configuration
Duplicate the example configuration file and adjust it with your local database credentials:
```bash
cp connections.example.json connections.json
```
*(The `connections.json` file is automatically ignored by Git to keep your credentials safe).*

### 4. Running the Server in Development Mode
```bash
npm run dev
```

### 5. Compiling TypeScript to JavaScript
```bash
npm run build
```

---

## 🧪 Testing

Before submitting a Pull Request, ensure all tests pass:

```bash
# 1. Test database connectivity
npm test

# 2. Test Write Rules & Exceptions
npm run test:write
```

---

## 🚀 Submitting a Contribution (Pull Request)

1. Fork this repository.
2. Create a new feature branch (`git checkout -b feature/your-feature-name`).
3. Write clean code and verify that `npm run build` succeeds with zero TypeScript errors.
4. Commit your changes with clear, descriptive commit messages (`git commit -m "feat: add new database adapter"`).
5. Push to your branch (`git push origin feature/your-feature-name`).
6. Open a **Pull Request** on GitHub.

---

## 📄 Code Policies
- Use TypeScript strict mode.
- Ensure no sensitive credentials or secrets are committed to the repository.
