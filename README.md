# Asset Reservation System

Modern asset reservation and management system with React frontend, NestJS/Fastify backend, PostgreSQL database, and AI-powered visual recognition capabilities.

---

## 🚀 Production Deployment (Docker Compose)

Deploy the entire stack (**PostgreSQL 17 Database** + **Prisma Migration & Seeding** + **Fastify Backend API** + **Nginx React Frontend**) in fully containerized production mode:

### Deploy All Services
```bash
# Using npm
npm run deploy

# Or using bash (macOS / Linux / WSL)
./scripts/deploy-all.sh

# Or using Windows PowerShell
.\scripts\deploy-all.ps1

# Or direct Docker Compose
docker compose up -d --build
```

### Deployment Management Commands
```bash
# View live container logs
npm run deploy:logs

# Check running container status
npm run deploy:ps

# Stop all deployed containers
npm run deploy:down

# Stop and wipe database volumes
npm run deploy:clean
```

---

## ⚡ Quick Start (Development)

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
├── database/                 # Docker Compose PostgreSQL config
│   ├── docker-compose.yml    # Postgres service definition
│   └── .env.example          # Database container environment
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
