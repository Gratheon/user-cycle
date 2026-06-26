#!/bin/sh

set -e

echo "Running pre-commit checks for user-cycle..."

if [ -f "$HOME/.nvm/nvm.sh" ]; then
    export NVM_DIR="$HOME/.nvm"
    . "$NVM_DIR/nvm.sh"

    if [ -f ".nvmrc" ]; then
        nvm use >/dev/null
    fi
fi

echo "1. Running TypeScript compilation check..."

if [ ! -f "./node_modules/.bin/tsc" ]; then
    echo "❌ Error: TypeScript not found. Please run 'pnpm install' first."
    exit 1
fi

./node_modules/.bin/tsc -p ./src/config/tsconfig.json --noEmit

echo "2. Running unit test suite..."

if [ ! -f "./node_modules/.bin/jest" ]; then
    echo "❌ Error: Jest not found. Please run 'pnpm install' first."
    exit 1
fi

./node_modules/.bin/jest --config jest.config.js --runInBand

echo "✅ All pre-commit checks passed!"
