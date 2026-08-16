#!/usr/bin/env bash
# Runs Backend NestJS/Fastify in Development Mode
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

node run-backend.mjs
