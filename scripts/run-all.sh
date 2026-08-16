#!/usr/bin/env bash
# Starts Database (Docker Compose), Backend (npm dev), and Frontend (npm dev) together
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

node run-all.mjs
