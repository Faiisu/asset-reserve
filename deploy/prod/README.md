# Real deploy

Three independent Compose stacks -- `database`, `backend`, `frontend` -- each
with its own `docker-compose.yml` and `.env`. Deploy and redeploy them
separately; none of them touch each other's data.

After configuring all three `.env` files below, run
`./scripts/deploy-prod.sh` from the repository root to build and deploy all
three stacks. It validates every configuration before starting services and
waits for each stack to become healthy before starting the next. Requires
Docker with Compose v2 supporting `up --wait --wait-timeout`. The script can
also be invoked by absolute path from any directory. It stops on failure;
already started stacks remain running for inspection with `docker compose logs`.

Production keeps host ports 8080 (frontend), 3000 (backend), and 5432
(PostgreSQL). Dev uses 18080/13000/15432 and separate containers, networks,
and volumes, so both deployments can run on the same host. Keep their
network and volume names distinct when overriding the defaults.

Data persistence: each stack's state lives in a named Docker volume
(`asset-reservation-postgres-data`, `asset-reservation-uploads-data`).
`docker compose down` on any of them stops the containers but keeps the
volume, so the next `up -d --build` reattaches to the same data. Only
`docker compose down -v` destroys it.

## First deploy (order matters)

```bash
# 1. Database -- creates the shared "asset-reservation-network"
cp deploy/prod/database/.env.example deploy/prod/database/.env   # edit POSTGRES_PASSWORD
docker compose -f deploy/prod/database/docker-compose.yml up -d

# 2. Backend -- joins that network, runs migrations + (idempotent) seed, then starts the API
cp deploy/prod/backend/.env.example deploy/prod/backend/.env     # edit JWT_SECRET, database connection, etc.
docker compose -f deploy/prod/backend/docker-compose.yml up -d

# 3. Frontend -- joins the same network, proxies /api to the backend
cp deploy/prod/frontend/.env.example deploy/prod/frontend/.env
docker compose -f deploy/prod/frontend/docker-compose.yml up -d
```

`DOCKER_NETWORK_NAME` must be identical across all three `.env` files (default
`asset-reservation-network`). `DOCKER_DATABASE_URL` in `backend/.env` must use
the same Postgres credentials as `database/.env`.

On the first deploy with a fresh database, sign in with username `admin`
and password `00000000`. The seed derives the username from the local part
of `BOOTSTRAP_ADMIN_EMAIL` (default `admin@example.com`); the email is not
the password-login username. Set `BOOTSTRAP_ADMIN_PASSWORD` in
`deploy/prod/backend/.env` to override the initial password.

The seed preserves existing accounts and password hashes on redeploy.
Changing `BOOTSTRAP_ADMIN_PASSWORD` does not reset an existing admin's password.

## Redeploy (picking up new code, keeping data)

```bash
docker compose -f deploy/prod/backend/docker-compose.yml up -d --build
docker compose -f deploy/prod/frontend/docker-compose.yml up -d --build
```

The database stack only needs redeploying if its image/config changed --
Postgres itself doesn't need rebuilding for app code changes.

## Stopping (data kept) vs wiping (data destroyed)

```bash
# Stop, data kept -- safe, the next `up -d` reattaches to the same volumes
docker compose -f deploy/prod/<service>/docker-compose.yml down

# Stop AND permanently delete that stack's volume -- irreversible
docker compose -f deploy/prod/<service>/docker-compose.yml down -v
```

## Notes

- `LOAD_MOCK_DATA` defaults to `false` here -- real deploys don't get the demo
  dataset. `backend/scripts/reset-and-seed-admin-only.ts` (`npm run db:reset`
  in `backend/`) is destructive (`TRUNCATE`s every table) and is intentionally
  **not** wired into either service here; run it manually and only if you
  mean it.
- `recognition-service/docker-compose.yml` (visual asset recognition) is
  optional and deployed separately -- point `RECOGNITION_SERVICE_URL` in
  `backend/.env` at it if you run it.
