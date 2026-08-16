#!/usr/bin/env bash
# Runs PostgreSQL database in Docker Compose
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

node run-database.mjs
