#!/bin/bash
# Installs dependencies at the start of Claude Code cloud sessions so lint,
# typecheck, tests and build work immediately.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
npm install --no-audit --no-fund
