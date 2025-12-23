# Scripts

## Git Hooks Setup

To install git hooks that prevent broken code from being committed:

```bash
npm run setup-git-hooks
```

This installs a pre-commit hook that:
- Runs TypeScript compilation check (`tsc --noEmit`)
- Prevents commits if compilation fails

## Manual Hook Installation

If you prefer to install the hook manually:

```bash
cp scripts/pre-commit.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

## Running Checks Manually

To run the same checks that the pre-commit hook runs:

```bash
npm run typecheck
```

Or directly:

```bash
npx tsc -p ./src/config/tsconfig.json --noEmit
```

