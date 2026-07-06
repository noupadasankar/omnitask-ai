#!/usr/bin/env bash
# OmniTask — one-command local dev launcher.
# Starts infra (Postgres + Redis), then runs backend + frontend + worker (turbo)
# and the Python browser engine together. Ctrl-C stops everything.
#
# Usage:  pnpm stack        (from repo root)
#    or:  bash scripts/dev.sh

set -euo pipefail
cd "$(dirname "$0")/.."

# Pick docker compose v2 ("docker compose") or fall back to v1 ("docker-compose").
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  echo "ERROR: docker compose not found. Install Docker Desktop." >&2
  exit 1
fi

echo "▶ Starting infra (Postgres + Redis)..."
$DC up -d postgres redis

# Pick a python interpreter.
PY="$(command -v python || command -v python3 || true)"
if [ -z "$PY" ]; then
  echo "ERROR: python not found on PATH." >&2
  exit 1
fi

echo "▶ Launching backend + frontend + worker (turbo) and the Python engine..."
echo "  (Ctrl-C stops everything)"

# Kill the whole process group on exit so no orphan servers linger.
trap 'kill 0' INT TERM EXIT

pnpm dev &
"$PY" apps/browser-py/main.py &
wait
