# Project Scaffolding Skill

---
name: project-scaffolding
description: >
  Generates well-structured project skeletons using CLI tools, framework
  templates, and opinionated folder layouts (Clean Architecture, MVC,
  Hexagonal Architecture). Use this skill at the start of a new project
  or when a new service/module needs to be bootstrapped from scratch.
---

## Purpose

Consistent project structure makes codebases navigable, onboarding faster,
and architecture violations detectable at a glance. This skill ensures that
every new project or module starts from a proven, opinionated layout rather
than an ad-hoc folder dump.

---

## Architecture Patterns Supported

### 1. Clean Architecture (default for backend services)

```
src/
├── domain/              # Enterprise business rules (zero dependencies)
│   ├── entities/        # Core domain objects
│   ├── value-objects/   # Immutable domain primitives
│   └── errors/          # Domain-specific error types
├── application/         # Application business rules (depends only on domain)
│   ├── use-cases/       # One file per use-case
│   ├── ports/           # Interfaces (repository, messaging, etc.)
│   └── dtos/            # Data Transfer Objects
├── infrastructure/      # Frameworks & drivers (depends on application)
│   ├── db/              # Repository implementations, migrations
│   ├── http/            # Controllers, middleware, route definitions
│   ├── messaging/       # Queue consumers/producers
│   └── config/          # Environment & secrets loading
└── main.ts              # Composition root / DI wiring
```

### 2. MVC (for simpler web apps)

```
src/
├── models/
├── views/
├── controllers/
├── routes/
├── middleware/
├── services/
└── config/
```

### 3. Hexagonal Architecture (Ports & Adapters)

```
src/
├── core/
│   ├── domain/
│   └── ports/
│       ├── inbound/     # Primary ports (use-case interfaces)
│       └── outbound/    # Secondary ports (repo, messaging interfaces)
├── adapters/
│   ├── inbound/         # HTTP, CLI, gRPC, event consumers
│   └── outbound/        # DB, cache, external APIs, file system
└── main.ts
```

### 4. Monorepo (for multi-package workspaces)

```
apps/
├── web/                 # Next.js frontend
├── api/                 # Express / Fastify backend
└── admin/               # Internal dashboard
packages/
├── ui/                  # Shared React components
├── config/              # Shared ESLint, TS configs
└── types/               # Shared TypeScript types
```

---

## Scaffolding Protocol

### Step 1 — Detect or Confirm Architecture Choice

Ask the user (or infer from context):
- What is the project type? (web app, REST API, CLI tool, library, monorepo)
- What architecture pattern fits best?
- What framework? (Next.js, Express, FastAPI, NestJS, etc.)

### Step 2 — Bootstrap with CLI Tools

Use the appropriate initialiser. Always:
1. Run with `--help` first to check available flags
2. Use non-interactive / preset flags where possible
3. Initialise in the current directory (`./`) or specified path

#### Frontend / Full-Stack
```bash
# Next.js
npx -y create-next-app@latest ./ --typescript --eslint --app --tailwind --src-dir --import-alias "@/*"

# Vite + React
npx -y create-vite@latest ./ --template react-ts

# SvelteKit
npx -y create-svelte@latest ./ --template skeleton --types ts
```

#### Backend (Node.js)
```bash
# NestJS
npx -y @nestjs/cli new . --package-manager npm --language TS --strict

# Express + TypeScript (manual)
npm init -y && npm install express && npm install -D typescript @types/node @types/express ts-node nodemon
```

#### Python
```bash
# FastAPI
pip install fastapi uvicorn && cookiecutter gh:tiangolo/full-stack-fastapi-template

# Django
django-admin startproject config . && python manage.py startapp core
```

### Step 3 — Apply Architecture Overlay

After CLI init, restructure into the chosen architecture pattern:
1. Create the folder tree (as defined in the patterns above)
2. Add index/barrel files to keep imports clean
3. Add placeholder files with comments explaining each layer's responsibility

### Step 4 — Install Shared Tooling

Always install and configure:

```bash
# TypeScript projects
npm install -D eslint prettier typescript \
  eslint-config-prettier \
  @typescript-eslint/eslint-plugin \
  @typescript-eslint/parser

# Python projects  
pip install ruff black pytest pytest-cov mypy
```

Add config files:
- `.eslintrc.json` / `eslint.config.js`
- `.prettierrc`
- `tsconfig.json` (strict mode on)
- `pyproject.toml` (for Python)
- `.editorconfig`
- `.gitignore`
- `.env.example`

### Step 5 — Init Git

```bash
git init
git add .
git commit -m "chore: initial project scaffold"
```

---

## Standard Files Always Added

| File | Purpose |
|------|---------|
| `README.md` | Project overview, setup, architecture summary |
| `.env.example` | All env vars with placeholder values |
| `.gitignore` | Comprehensive ignore rules for the chosen stack |
| `CONTRIBUTING.md` | Branching strategy, commit convention |
| `docs/architecture/context.md` | System context diagram placeholder |
| `Makefile` or `package.json scripts` | Runbook of common commands |

---

## Rules the Agent MUST Follow

1. **Never scaffold directly into a non-empty directory** without confirming with the user.
2. **Always run CLI help first** — `npx create-x --help` before executing init.
3. **Commit the scaffold immediately** — the first commit must be the clean scaffold, before any feature code.
4. **Document each layer** — each folder must contain a brief `README.md` or inline comments explaining its responsibility.
5. **Enforce strict mode** — `TypeScript strict: true`, `mypy --strict`, `ruff` with all rules enabled by default.
