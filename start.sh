#!/usr/bin/env bash
# RTO Shield - start backend (FastAPI :8000) and frontend (Next.js :3000) dev servers.
# Usage: ./start.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

if [ -x "$BACKEND/.venv/bin/python" ]; then
  PY="$BACKEND/.venv/bin/python"
elif [ -x "$BACKEND/.venv/Scripts/python.exe" ]; then
  PY="$BACKEND/.venv/Scripts/python.exe"
else
  echo "Creating Python virtualenv..."
  (cd "$BACKEND" && python3 -m venv .venv)
  PY="$BACKEND/.venv/bin/python"
  [ -x "$PY" ] || PY="$BACKEND/.venv/Scripts/python.exe"
  "$PY" -m pip install --upgrade pip
  "$PY" -m pip install -r "$BACKEND/requirements.txt"
fi

if [ ! -d "$FRONTEND/node_modules" ]; then
  echo "Installing frontend dependencies..."
  (cd "$FRONTEND" && npm install)
fi

export DISABLE_SQLALCHEMY_CEXT_RUNTIME=1

cleanup() {
  echo "Stopping..."
  kill "${BE_PID:-}" "${FE_PID:-}" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting backend on http://localhost:8000 (docs: /docs)"
(cd "$BACKEND" && exec "$PY" run.py) &
BE_PID=$!

echo "Starting frontend on http://localhost:3000"
(cd "$FRONTEND" && exec npm run dev) &
FE_PID=$!

wait -n "$BE_PID" "$FE_PID"
