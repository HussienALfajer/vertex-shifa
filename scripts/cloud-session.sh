#!/usr/bin/env bash
# SessionStart hook: prepares a Claude Code cloud session in the `vertex` environment
# (dependencies, .env, PostgreSQL, migrations, Playwright). A silent no-op locally.
# Never fails the session: it always exits 0. Docs: docs/workflow.md, "Cloud sessions".

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

if command -v vertex-session >/dev/null 2>&1; then
  vertex-session "${CLAUDE_PROJECT_DIR:-$PWD}" || true
else
  echo "Not in the 'vertex' cloud environment (no vertex-session on PATH): no database or browsers prepared. See docs/workflow.md, 'Cloud sessions'."
fi

exit 0
