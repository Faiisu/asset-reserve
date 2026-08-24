# Dev deploy

One Compose stack (`deploy/dev/docker-compose.yml`) that always rebuilds
every image from whatever is currently on disk. Use it to sanity-check the
containerized build of a change, not for anything you need to keep around.

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
