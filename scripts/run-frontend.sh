#!/usr/bin/env bash
# Runs Frontend React/Vite in Development Mode
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

node run-frontend.mjs
