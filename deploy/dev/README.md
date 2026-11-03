# Dev deploy

One Compose stack (`deploy/dev/docker-compose.yml`) that always rebuilds
every image from whatever is currently on disk. Use it to sanity-check the
containerized build of a change, not for anything you need to keep around.

Run `./scripts/deploy-dev.sh` from the repository root for a complete deploy.
It creates `.env` from `.env.example` if missing, rebuilds the images, and
waits for healthy services. Requires Docker with Compose v2 supporting
`up --wait --wait-timeout`. The script can also be invoked by absolute path
from any directory. This is a container build, without source hot reload;
use `./scripts/run-all.sh` for local development with hot reload.

Default host ports are frontend **18080**, backend **13000**, and PostgreSQL
**15432**, so this stack can run alongside production (8080/3000/5432).
New dev databases use the name `asset_reservation_dev`. The PostgreSQL
container, network, database volume, and uploads volume are separate from
production. Container-internal ports stay 80/3000/5432.

For an existing `.env`, update ports and CORS/frontend/OAuth URLs from
`.env.example` manually; the deploy script preserves your configuration.
Keep `POSTGRES_DB` unchanged for an existing database volume, since changing
the environment variable does not rename the existing database. Keep dev
and production network/volume names distinct.

```bash
cp deploy/dev/.env.example deploy/dev/.env   # first time only, defaults work as-is

# Rebuild and (re)start everything with the current code
docker compose -f deploy/dev/docker-compose.yml up -d --build

# Re-run the demo-data seed only (safe, upserts -- doesn't wipe anything)
docker compose -f deploy/dev/docker-compose.yml --profile tools run --rm seed

# DESTRUCTIVE: truncate every table, wipe uploaded images, keep only the admin user
docker compose -f deploy/dev/docker-compose.yml --profile tools run --rm reset

docker compose -f deploy/dev/docker-compose.yml logs -f
docker compose -f deploy/dev/docker-compose.yml down       # stop, volumes kept
docker compose -f deploy/dev/docker-compose.yml down -v    # stop, volumes wiped
```

Equivalent `npm run` shortcuts are in the repo root `package.json`
(`deploy:dev:up`, `deploy:dev:seed`, `deploy:dev:reset`, `deploy:dev:down`,
`deploy:dev:clean`, `deploy:dev:logs`, `deploy:dev:ps`).

For a persistent, data-preserving deploy of individually-redeployable
services, see [`../prod/README.md`](../prod/README.md) instead.
