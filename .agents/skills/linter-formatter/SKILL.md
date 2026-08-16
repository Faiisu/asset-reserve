# Linter & Formatter Execution Skill

---
name: linter-formatter
description: >
  Equips the AI agent with the ability to run linters and formatters
  automatically after every code change, read the output, and self-correct
  errors without user intervention. Supports ESLint, Prettier, TypeScript tsc,
  Black, Ruff, Mypy, and SonarQube. Activate this skill after any code
  generation or modification step.
---

## Purpose

Linting and formatting are the first line of quality defence. This skill
ensures the agent never delivers code that:
- Violates style guides
- Contains unused variables or imports
- Has detectable type errors
- Breaks team formatting conventions

The agent must behave like a developer who **always runs the linter before
committing**.

---

## Supported Tools by Ecosystem

### JavaScript / TypeScript

| Tool | Command | What it catches |
|------|---------|-----------------|
| ESLint | `npx eslint . --ext .ts,.tsx,.js,.jsx --fix` | Code quality, anti-patterns |
| Prettier | `npx prettier --write .` | Formatting |
| TypeScript | `npx tsc --noEmit` | Type errors |
| tsc (strict) | `npx tsc --noEmit --strict` | Strict type errors |

### Python

| Tool | Command | What it catches |
|------|---------|-----------------|
| Ruff | `ruff check . --fix` | Linting + import sorting |
| Black | `black .` | Formatting |
| Mypy | `mypy . --strict` | Type checking |
| Bandit | `bandit -r src/` | Security issues |

### Go

| Tool | Command | What it catches |
|------|---------|-----------------|
| gofmt | `gofmt -w .` | Formatting |
| golangci-lint | `golangci-lint run ./...` | Linting |
| go vet | `go vet ./...` | Suspicious constructs |

### Rust

| Tool | Command | What it catches |
|------|---------|-----------------|
| rustfmt | `cargo fmt` | Formatting |
| Clippy | `cargo clippy -- -D warnings` | Lints as errors |

---

## Execution Protocol

### Step 1 — Detect Available Tools

```bash
# JS/TS
cat package.json | grep -E '"(eslint|prettier|typescript)"'
ls .eslintrc* prettier* tsconfig*

# Python
cat pyproject.toml | grep -E '(ruff|black|mypy)'
which ruff black mypy
```

### Step 2 — Run Formatter First, Then Linter

Always run in this order to avoid false positives:

```bash
# TypeScript example
npx prettier --write .       # 1. Format first
npx eslint . --fix           # 2. Then lint (with auto-fix)
npx tsc --noEmit             # 3. Type-check (no auto-fix, must fix manually)
```

```bash
# Python example
black .                      # 1. Format
ruff check . --fix           # 2. Lint + auto-fix
mypy . --strict              # 3. Type-check
```

### Step 3 — Parse Output & Self-Correct

After running linter commands, parse the output:

#### If errors are auto-fixable (ESLint `--fix`, Ruff `--fix`, Black):
→ Run the fix command and confirm it resolved the issue by re-running.

#### If errors require manual fix:
Read each error, understand it, patch the code, then re-run the linter.

**Error parsing template:**

```
<file>:<line>:<col>: <code> <message>
```

For each error:
1. Open the file at the reported line
2. Understand the violation
3. Apply a targeted fix (do NOT rewrite the whole file)
4. Re-run linter to confirm fix

### Step 4 — Report Results

After a clean run, report:

```markdown
## ✅ Linter Report

| Tool | Status | Issues Fixed | Remaining |
|------|--------|-------------|-----------|
| Prettier | ✅ Clean | 12 files reformatted | 0 |
| ESLint | ✅ Clean | 3 auto-fixed | 0 |
| TypeScript | ✅ Clean | — | 0 type errors |
```

---

## Self-Correction Loop

```
Run linter
     ↓
Any errors?
  Yes → Can auto-fix?
          Yes → run --fix → re-run linter
          No  → read error → patch code → re-run linter
  No  → Report ✅ Clean → continue
```

Maximum **3 self-correction attempts** per linter run. If errors persist after 3
attempts, surface them to the user with the exact error message and proposed fix.

---

## Pre-Commit Integration

When setting up a new project, install `husky` + `lint-staged` so linting runs
automatically on every `git commit`:

```bash
npm install -D husky lint-staged
npx husky init
```

`.husky/pre-commit`:
```bash
npx lint-staged
```

`package.json`:
```json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["prettier --write", "eslint --fix"],
    "*.{json,md,yaml,yml}": ["prettier --write"]
  }
}
```

---

## Rules the Agent MUST Follow

1. **Run linter after every code change** — no exceptions, even for "small" changes.
2. **Never leave linter errors in delivered code** — a clean linter run is part of the Definition of Done.
3. **Fix at the source, not with ignores** — never add `// eslint-disable` or `# noqa` unless it's a deliberate, documented exception.
4. **Type errors are blockers** — TypeScript / Mypy errors must be fixed, not suppressed with `any` or `type: ignore`.
5. **Report the tool versions used** — include `eslint --version`, `ruff --version`, etc. in the linter report.
