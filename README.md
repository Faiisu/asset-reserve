# Asset Reservation System

Modern asset reservation and management system with React frontend, NestJS/Fastify backend, PostgreSQL database, and AI-powered visual recognition capabilities.

---

## 🚀 Docker Deploy

Two separate Docker Compose setups live under [`deploy/`](deploy/) — pick the one that matches what you're doing:

| | [`deploy/dev/`](deploy/dev/README.md) | [`deploy/prod/`](deploy/prod/README.md) |
| --- | --- | --- |
| Purpose | Rebuild and run the current code in containers | Real, standing deployment |
| Shape | One Compose stack (db + backend + frontend) | Three independent Compose stacks (database, backend, frontend) |
| Redeploy | `up -d --build` always rebuilds from source | Redeploy backend/frontend independently; database untouched |
| Data | Disposable — `db:seed`/`db:reset` reset it freely | Persistent — `down` keeps the volumes, only `down -v` wipes them |

### Dev deploy
```bash
./scripts/deploy-dev.sh    # creates .env if missing, builds, starts, waits for health

# Or use the existing npm shortcuts:
cp deploy/dev/.env.example deploy/dev/.env   # first time only

npm run deploy:dev:up      # build + start db, backend, frontend
npm run deploy:dev:seed    # re-run the demo-data seed (idempotent)
npm run deploy:dev:reset   # DESTRUCTIVE: wipe everything, keep only the admin user
npm run deploy:dev:logs
npm run deploy:dev:down    # stop, volumes kept
npm run deploy:dev:clean   # stop, volumes wiped
```

### Real (prod) deploy
```bash
# First time: fill in deploy/prod/{database,backend,frontend}/.env from their .env.example
./scripts/deploy-prod.sh   # validates config, builds, starts in order, waits for health

# Or use the existing npm shortcut:
npm run deploy:prod:up     # starts database, then backend, then frontend

# Redeploy backend/frontend after a code change -- database and its data untouched
docker compose -f deploy/prod/backend/docker-compose.yml up -d --build
docker compose -f deploy/prod/frontend/docker-compose.yml up -d --build

npm run deploy:prod:ps
npm run deploy:prod:down   # stop, volumes kept
```

See [`deploy/prod/README.md`](deploy/prod/README.md) for first-deploy ordering, required env vars, and the difference between `down` and `down -v`.

### Run dev and production on the same host

The Docker deployments use separate ports, PostgreSQL containers, networks,
and data volumes by default:

| Service | Dev | Production |
| --- | --- | --- |
| Frontend | http://localhost:18080 | http://localhost:8080 |
| Backend API | http://localhost:13000 | http://localhost:3000 |
| PostgreSQL host port | 15432 | 5432 |
| Database name | `asset_reservation_dev` | `asset_reservation` |

Configure the production `.env` files first, then run both deployments:

```bash
./scripts/deploy-dev.sh
./scripts/deploy-prod.sh
```

Both environments stay running together. Dev migrations and resets operate
on the dev database; production uses its own database and uploads volume.
Keep the default separate network and volume names when customizing `.env`.
If you already have `deploy/dev/.env`, update `POSTGRES_PORT=15432`,
`BACKEND_PORT=13000`, `FRONTEND_PORT=18080`, and the frontend/CORS/OAuth URLs
to match `deploy/dev/.env.example`; existing `.env` files are not overwritten.
For an existing dev database, keep its current `POSTGRES_DB` value: changing
that variable does not rename a database in an initialized PostgreSQL volume.

---

## ⚡ Quick Start (Development)

Local development requires **Node.js 22.12.0 or newer** and npm. Node 20
causes `EBADENGINE` warnings because backend dependencies require Node 22.
With nvm, switch versions from the repository root before starting:

```bash
nvm install
nvm use
npm run dev
```

The repository's `.nvmrc` selects Node 22. The run scripts check the runtime
before installing dependencies or changing environment files.

All run and deployment scripts are centralized inside the [`scripts/`](scripts/) directory.

You can start all services (**Database Docker** + **Backend npm dev** + **Frontend npm dev**) with any of the following:

### Option 1: Using npm (from project root)
```bash
npm run dev
```

### Option 2: Windows PowerShell
```powershell
.\scripts\run-all.ps1
```

### Option 3: Windows Batch / Double-Click
Double-click `scripts\run-all.bat` or run:
```cmd
scripts\run-all.bat
```

### Option 4: Linux / macOS / WSL / Git Bash
```bash
chmod +x scripts/*.sh
./scripts/run-all.sh
```

---

## 📍 Services & URLs

| Service | Technology | URL / Port | Description |
| :--- | :--- | :--- | :--- |
| **Frontend** | React 19 + Vite | [http://localhost:5173](http://localhost:5173) | Web user interface |
| **Backend API** | NestJS + Fastify | [http://localhost:3000](http://localhost:3000) | REST API server |
| **API Docs (Swagger)** | OpenAPI 3.1 | [http://localhost:3000/api/docs](http://localhost:3000/api/docs) | Interactive API documentation |
| **Database** | PostgreSQL 17 (Docker) | `localhost:5432` | Relational database storage |

---

## 🛠️ Running Services Individually

All individual run scripts are located in [`scripts/`](file:///C:/projects/asset-reserve/scripts):

### 1. Database (Docker Compose)
- **PowerShell**: [`.\scripts\run-database.ps1`](file:///C:/projects/asset-reserve/scripts/run-database.ps1)
- **Batch**: [`scripts\run-database.bat`](file:///C:/projects/asset-reserve/scripts/run-database.bat)
- **Bash**: [`./scripts/run-database.sh`](file:///C:/projects/asset-reserve/scripts/run-database.sh)
- **npm**: `npm run dev:db` (or `npm run db:up`)

### 2. Backend (NestJS / Fastify Dev)
- **PowerShell**: [`.\scripts\run-backend.ps1`](file:///C:/projects/asset-reserve/scripts/run-backend.ps1)
- **Batch**: [`scripts\run-backend.bat`](file:///C:/projects/asset-reserve/scripts/run-backend.bat)
- **Bash**: [`./scripts/run-backend.sh`](file:///C:/projects/asset-reserve/scripts/run-backend.sh)
- **npm**: `npm run dev:backend`

### 3. Frontend (React / Vite Dev)
- **PowerShell**: [`.\scripts\run-frontend.ps1`](file:///C:/projects/asset-reserve/scripts/run-frontend.ps1)
- **Batch**: [`scripts\run-frontend.bat`](file:///C:/projects/asset-reserve/scripts/run-frontend.bat)
- **Bash**: [`./scripts/run-frontend.sh`](file:///C:/projects/asset-reserve/scripts/run-frontend.sh)
- **npm**: `npm run dev:frontend`

---

## 🛑 Stopping All Services

- **PowerShell**: [`.\scripts\stop-all.ps1`](file:///C:/projects/asset-reserve/scripts/stop-all.ps1)
- **Batch**: [`scripts\stop-all.bat`](file:///C:/projects/asset-reserve/scripts/stop-all.bat)
- **Bash**: [`./scripts/stop-all.sh`](file:///C:/projects/asset-reserve/scripts/stop-all.sh)
- **npm**: `npm run stop`

---

## 🗄️ Database Management & Seeding

```bash
# Apply pending migrations (same command the Docker deployment runs)
npm run db:migrate

# Seed database with demonstration data (users, assets, reservations)
npm run db:seed

# Reset and seed only the system administrator user
npm run db:reset
```

### Default Credentials
- **Admin Username:** `admin`
- **Admin Email:** `admin@example.com`
- **Admin Password:** `00000000`
- **Database Connection:** `postgresql://asset_reservation:change-this-database-password@localhost:5432/asset_reservation?schema=public`

---

## 📁 Repository Structure

```
asset-reserve/
├── backend/                  # NestJS + Fastify REST API
│   ├── src/                  # Application source code
│   ├── prisma/               # Database schema and migrations
│   ├── scripts/              # Backend seed scripts
│   ├── .env.example          # Environment template
│   └── package.json
├── frontend/                 # React 19 + Vite Frontend
│   ├── src/                  # UI components and pages
│   ├── .env.example          # Frontend environment template
│   └── package.json
├── deploy/                   # 🐳 Docker deploy configuration
│   ├── dev/                  # Single rebuild-from-source stack (see deploy/dev/README.md)
│   └── prod/                 # database/, backend/, frontend/ -- 3 independent, data-persistent stacks (see deploy/prod/README.md)
├── docs/                     # OpenAPI specifications and documentation
├── recognition-service/      # Python visual asset recognition service
├── scripts/                  # 📁 Centralized Run & Automation Directory
│   ├── run-all.bat / .ps1 / .sh / .mjs       # Start all together
│   ├── run-database.bat / .ps1 / .sh / .mjs  # Start database container
│   ├── run-backend.bat / .ps1 / .sh / .mjs   # Start backend dev server
│   ├── run-frontend.bat / .ps1 / .sh / .mjs  # Start frontend dev server
│   └── stop-all.bat / .ps1 / .sh / .mjs      # Stop all services
└── package.json              # Root workspace management
```
