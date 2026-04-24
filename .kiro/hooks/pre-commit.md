# BunqShield — Pre-commit Hook

## .kiro/hooks/pre-commit.md

Run lint and type checks before every commit.

## Hook Script: .git/hooks/pre-commit

```bash
#!/bin/bash
set -e

echo "==> Running pre-commit checks..."

# Backend: ruff lint
if [ -d "backend" ]; then
  echo "  [backend] ruff lint..."
  cd backend
  source .venv/bin/activate 2>/dev/null || true
  ruff check . --fix
  echo "  [backend] mypy type check..."
  mypy . --ignore-missing-imports
  cd ..
fi

# Frontend: eslint + tsc
if [ -d "frontend" ]; then
  echo "  [frontend] eslint..."
  cd frontend
  npm run lint --if-present
  echo "  [frontend] tsc..."
  npx tsc --noEmit
  cd ..
fi

echo "==> Pre-commit checks passed."
```

## Setup
```bash
cp .kiro/hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

## Rules
- ruff: E, F, I (errors, pyflakes, isort)
- mypy: strict=false, ignore_missing_imports=true
- tsc: strict=true (tsconfig.json)
- eslint: react + typescript recommended rules
