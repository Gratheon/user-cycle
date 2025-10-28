#!/bin/sh
set -e
cd /app
# Install dev dependencies into the (initially empty) anonymous /app/node_modules volume if needed
if [ ! -f node_modules/.bin/ts-node-dev ]; then
  echo "[dev-entry] node_modules empty or missing ts-node-dev; running npm install..."
  npm install --include=dev
fi
echo "[dev-entry] Starting ts-node-dev (project=src/config/tsconfig.json) on src/user-cycle.ts"
exec node_modules/.bin/ts-node-dev --respawn --transpile-only --prefer-ts --exit-child --project src/config/tsconfig.json src/user-cycle.ts
