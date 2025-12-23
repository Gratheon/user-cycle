#!/bin/sh

echo "Running pre-commit checks for user-cycle..."

if [ -f "$HOME/.nvm/nvm.sh" ]; then
    . "$HOME/.nvm/nvm.sh"
fi

export PATH="/usr/local/bin:/opt/homebrew/bin:$HOME/.nvm/versions/node/$(ls -t $HOME/.nvm/versions/node 2>/dev/null | head -1)/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
    echo "⚠️  Warning: node not found in PATH. Attempting to locate..."

    for NODE_DIR in /usr/local/bin /opt/homebrew/bin $HOME/.nvm/versions/node/*/bin; do
        if [ -x "$NODE_DIR/node" ]; then
            export PATH="$NODE_DIR:$PATH"
            break
        fi
    done
fi

echo "1. Running TypeScript compilation check..."

if ! command -v node >/dev/null 2>&1; then
    echo "❌ Error: Could not find node. Please ensure Node.js is installed."
    exit 1
fi

if [ ! -f "./node_modules/.bin/tsc" ]; then
    echo "❌ Error: TypeScript not found. Please run 'npm install' first."
    exit 1
fi

./node_modules/.bin/tsc -p ./src/config/tsconfig.json --noEmit
TSC_EXIT_CODE=$?

if [ $TSC_EXIT_CODE -ne 0 ]; then
    echo "❌ TypeScript compilation failed. Please fix the errors before committing."
    exit 1
fi

echo "✅ All pre-commit checks passed!"
exit 0

