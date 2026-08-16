# Dependency Management Skill

---
name: dependency-management
description: >
  Equips the AI agent to safely install, update, audit, and document project
  dependencies using the appropriate package manager (npm/pnpm/yarn, pip/uv,
  cargo, go mod). Ensures lock files are correct, no unnecessary dependencies
  are added, and security vulnerabilities are surfaced. Activate this skill
  before installing any library or after modifying package files.
---

## Purpose

Dependency sprawl is one of the most common sources of:
- Security vulnerabilities (supply-chain attacks)
- Bloated bundle sizes
- Hard-to-reproduce builds (missing lock file updates)
- Version conflicts that break CI months later

This skill enforces disciplined dependency hygiene.

---

## Package Manager Detection

Before any operation, detect the package manager in use:

```bash
# Node.js — check for lock file
ls package-lock.json  → npm
ls yarn.lock          → yarn
ls pnpm-lock.yaml     → pnpm
ls bun.lockb          → bun

# Python
ls uv.lock            → uv
ls poetry.lock        → poetry
ls Pipfile.lock       → pipenv
ls requirements.txt   → pip (legacy)

# Rust
ls Cargo.lock         → cargo

# Go
ls go.sum             → go mod
```

**NEVER mix package managers** on the same project. If `yarn.lock` exists,
always use `yarn`. If unsure, ask the user.

---

## Installation Protocol

### Step 1 — Justify the Dependency

Before installing ANY new library, answer:

| Question | Requirement |
|----------|-------------|
| What problem does this solve? | Must be a real, current requirement |
| Is there a built-in alternative? | (e.g., use `fetch` instead of `axios` if target env supports it) |
| What is the library's maintenance status? | Check GitHub stars, last commit, open issues |
| What is the bundle size impact? | Check bundlephobia.com for JS libs |
| Does it have known CVEs? | Run audit before and after install |

### Step 2 — Install with Explicit Versioning

```bash
# npm — pin major version
npm install <package>@^<major.minor.patch>

# pip — pin in requirements file
pip install <package>==<version>
echo "<package>==<version>" >> requirements.txt

# cargo — specify in Cargo.toml
cargo add <crate>@<version>

# go
go get <module>@v<version>
```

### Step 3 — Update Lock File

Verify the lock file was updated:

```bash
# npm
git diff package-lock.json  # should show changes

# Python with uv
uv lock

# pip
pip freeze > requirements.txt  # or use pip-tools: pip-compile
```

### Step 4 — Run Security Audit

```bash
# npm
npm audit
npm audit --audit-level=high  # fail only on high/critical

# Python
pip-audit  # or: safety check

# Rust
cargo audit

# Go
govulncheck ./...
```

If vulnerabilities are found:
- **Critical / High**: Block and fix before proceeding
- **Medium**: Surface to user with remediation options
- **Low**: Log in a `SECURITY.md` note

---

## Removing Dependencies

When removing a feature, always clean up its dependencies:

```bash
# npm — remove and update lock file
npm uninstall <package>

# Detect orphaned dependencies
npx depcheck  # find unused deps

# Python
pip-autoremove <package> -y  # removes package + unused transitive deps
```

---

## Dependency Update Workflow

For periodic updates (run monthly or before major releases):

```bash
# npm — interactive update
npx npm-check-updates -i

# Python with pip-tools
pip-compile --upgrade requirements.in

# Cargo
cargo update

# Go
go get -u ./...
go mod tidy
```

Always run the full test suite after any update:
```bash
npm test   # or: pytest, cargo test, go test ./...
```

---

## Lock File Rules

| Rule | Reason |
|------|--------|
| Lock files MUST be committed to Git | Reproducible builds |
| Never hand-edit lock files | They are machine-generated |
| `node_modules/` must be in `.gitignore` | Never commit deps |
| Lock file changes must be in a dedicated commit | Easier to review |

---

## Dependency Documentation

After installing a new dependency, update `README.md` or `docs/dependencies.md`:

```markdown
## Key Dependencies

| Package | Version | Purpose | Alternatives Considered |
|---------|---------|---------|------------------------|
| zod | ^3.22 | Runtime schema validation | yup (heavier), joi (Node-only) |
| prisma | ^5.7 | ORM + migrations | TypeORM (more complex), Drizzle (newer) |
```

---

## Rules the Agent MUST Follow

1. **Never install a package without justifying it first** — explain why, and confirm with the user for production dependencies.
2. **Always update the lock file** — a diff that changes `package.json` without changing the lock file is incomplete.
3. **Run `npm audit` / `pip-audit` after every install** — security is non-negotiable.
4. **Prefer smaller, focused libraries** — one library that does one thing well beats a mega-framework.
5. **Separate runtime and dev dependencies** — use `--save-dev` / `[dev]` extras appropriately.
6. **Check bundle size for frontend libs** — no frontend dependency over 50kB minified+gzipped without explicit approval.
