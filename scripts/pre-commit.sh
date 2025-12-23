#!/bin/sh

echo "Running pre-commit checks for user-cycle..."

export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.nvm/versions/node/$(ls -t $HOME/.nvm/versions/node 2>/dev/null | head -1)/bin:$PATH"

if command -v node >/dev/null 2>&1; then
    NODE_PATH=$(dirname $(which node))
    export PATH="$NODE_PATH:$PATH"
fi

echo "1. Running TypeScript compilation check..."
if command -v npx >/dev/null 2>&1; then
    npx tsc -p ./src/config/tsconfig.json --noEmit
    TSC_EXIT_CODE=$?
elif [ -f "./node_modules/.bin/tsc" ]; then
    ./node_modules/.bin/tsc -p ./src/config/tsconfig.json --noEmit
    TSC_EXIT_CODE=$?
else
    echo "❌ Error: Could not find tsc. Please run 'npm install' first."
    exit 1
fi

if [ $TSC_EXIT_CODE -ne 0 ]; then
    echo "❌ TypeScript compilation failed. Please fix the errors before committing."
    exit 1
fi

echo "✅ All pre-commit checks passed!"
exit 0

