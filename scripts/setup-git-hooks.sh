#!/bin/sh

echo "Setting up git hooks for user-cycle..."

HOOK_DIR=".git/hooks"
HOOK_FILE="$HOOK_DIR/pre-commit"

if [ ! -d "$HOOK_DIR" ]; then
    echo "❌ Error: .git/hooks directory not found. Are you in the repository root?"
    exit 1
fi

cp scripts/pre-commit.sh "$HOOK_FILE"
chmod +x "$HOOK_FILE"

echo "✅ Git pre-commit hook installed successfully!"
echo "The hook will run TypeScript compilation checks before each commit."

