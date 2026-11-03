#!/usr/bin/env bash
# Build and start production stacks in dependency order, preserving volumes.
set -euo pipefail

if [[ $# -ne 0 ]]; then
  echo "Usage: $0" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

command -v docker >/dev/null 2>&1 || { echo "Docker is required." >&2; exit 1; }
docker compose version >/dev/null
docker info >/dev/null

compose() {
  local stack="$1"
  shift
  local deploy_dir="$ROOT_DIR/deploy/prod/$stack"
  docker compose --project-directory "$deploy_dir" --env-file "$deploy_dir/.env" \
    -f "$deploy_dir/docker-compose.yml" "$@"
}

# Validate every stack before changing the running deployment.
missing_env=0
for stack in database backend frontend; do
  if [[ ! -f "$ROOT_DIR/deploy/prod/$stack/.env" ]]; then
    echo "Create deploy/prod/$stack/.env from its .env.example and configure it before deploying." >&2
    missing_env=1
  fi
done
[[ "$missing_env" -eq 0 ]] || exit 1

for stack in database backend frontend; do
  compose "$stack" config --quiet
done

for stack in database backend frontend; do
  echo "Deploying production $stack..."
  compose "$stack" up -d --build --wait --wait-timeout 180
done

for stack in database backend frontend; do
  compose "$stack" ps
done
echo "Production deployment is ready. Existing database and upload volumes are preserved."
