#!/usr/bin/env bash
# Start the backend (uvicorn --reload) and the frontend (vite) for local development.
# First run: creates backend/.venv and installs dependencies. Ctrl+C stops both.
# Docker alternative: docker compose up --build  (see docker-compose.yml).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT/backend"
if [ ! -d .venv ]; then
  python3.11 -m venv .venv 2>/dev/null || python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt -r requirements-dev.txt
fi
PY=.venv/bin/python; [ -x "$PY" ] || PY=.venv/Scripts/python.exe

cd "$ROOT/frontend"
[ -d node_modules ] || npm ci --no-audit --no-fund

cd "$ROOT/backend"
"$PY" -m uvicorn app.main:app --reload --port "${API_PORT:-8000}" &
API_PID=$!
trap 'kill $API_PID 2>/dev/null' EXIT INT TERM

cd "$ROOT/frontend"
echo "MathMind: web http://localhost:5173  ·  API http://localhost:${API_PORT:-8000}/docs"
VITE_PROXY_TARGET="http://localhost:${API_PORT:-8000}" npm run dev
