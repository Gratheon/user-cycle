# Scripts

## Git Hooks Setup

To install git hooks that prevent broken code from being committed:

```bash
npm run setup-git-hooks
```

This installs a pre-commit hook that:
- Uses the Node.js version from `.nvmrc` when nvm is available
- Runs TypeScript compilation check (`tsc --noEmit`)
- Runs the unit test suite (`jest --config jest.config.js --runInBand`)
- Prevents commits if compilation or unit tests fail

## Manual Hook Installation

If you prefer to install the hook manually:

```bash
cp scripts/pre-commit.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

## Running Checks Manually

To run the same checks that the pre-commit hook runs:

```bash
sh scripts/pre-commit.sh
```

Or directly:

```bash
npx tsc -p ./src/config/tsconfig.json --noEmit
npx jest --config jest.config.js --runInBand
```
