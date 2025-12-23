#!/bin/sh

echo "Running pre-commit checks for user-cycle..."

if [ -f "$HOME/.nvm/nvm.sh" ]; then
    export NVM_DIR="$HOME/.nvm"
    . "$NVM_DIR/nvm.sh"
fi

export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

if [ -d "$HOME/.nvm/versions/node" ]; then
    LATEST_NODE=$(ls -t "$HOME/.nvm/versions/node" 2>/dev/null | head -1)
    if [ -n "$LATEST_NODE" ]; then
        export PATH="$HOME/.nvm/versions/node/$LATEST_NODE/bin:$PATH"
    fi
fi

if ! command -v node >/dev/null 2>&1; then
    echo "⚠️  Warning: node not found in PATH. Searching common locations..."

    for NODE_PATH in \
        /usr/local/bin/node \
        /opt/homebrew/bin/node \
        $HOME/.nvm/versions/node/*/bin/node; do

        if [ -x "$NODE_PATH" ]; then
            export PATH="$(dirname "$NODE_PATH"):$PATH"
            break
        fi
    done
fi

echo "1. Running TypeScript compilation check..."

if ! command -v node >/dev/null 2>&1; then
    echo "❌ Error: Could not find node. Please ensure Node.js is installed."
    echo "   Searched paths: /usr/local/bin, /opt/homebrew/bin, ~/.nvm/versions/node"
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

