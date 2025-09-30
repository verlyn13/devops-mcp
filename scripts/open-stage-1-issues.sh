#!/usr/bin/env bash
set -euo pipefail

# Helper to open Stage 1 issues using GitHub CLI
# Requires: gh auth login

REPO=${REPO:-$(git config --get remote.origin.url | sed -E 's#.*/([^/]+/[^/]+)\.git#\1#')}
TITLE=${TITLE:-"Stage 1 — Contract Freeze & CI Gates"}

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) required. Install and run 'gh auth login'." >&2
  exit 2
fi

body=$(cat docs/issues/stage-1.md)
gh issue create --repo "$REPO" --title "$TITLE" --body "$body" --label orchestration --label stage --label tracking

echo "Opened Stage 1 issue in $REPO"

