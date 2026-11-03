#!/usr/bin/env bash
# Build and start the containerized development environment.
set -euo pipefail

if [[ $# -ne 0 ]]; then
  echo "Usage: $0" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$ROOT_DIR/deploy/dev"

command -v docker >/dev/null 2>&1 || { echo "Docker is required." >&2; exit 1; }
docker compose version >/dev/null
docker info >/dev/null

if [[ ! -f "$DEPLOY_DIR/.env" ]]; then
  (umask 077; cp "$DEPLOY_DIR/.env.example" "$DEPLOY_DIR/.env")
  echo "Created deploy/dev/.env from the development defaults."
fi

compose=(docker compose --project-directory "$DEPLOY_DIR" --env-file "$DEPLOY_DIR/.env" -f "$DEPLOY_DIR/docker-compose.yml")
"${compose[@]}" config --quiet
"${compose[@]}" up -d --build --wait --wait-timeout 180
"${compose[@]}" ps
echo "Development deployment is ready. See the published ports above."
