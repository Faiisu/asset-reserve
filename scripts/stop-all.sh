#!/usr/bin/env bash
# Stops Database Docker Compose and development services
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

node stop-all.mjs
