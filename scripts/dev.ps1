# Start the backend (uvicorn --reload) and the frontend (vite) for local development on Windows.
# First run: creates backend\.venv and installs dependencies. Close the API window to stop it.
# Docker alternative: docker compose up --build  (see docker-compose.yml).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$port = if ($env:API_PORT) { $env:API_PORT } else { '8000' }

Push-Location "$root\backend"
if (-not (Test-Path .venv)) {
    py -3.11 -m venv .venv
    .\.venv\Scripts\pip install -q -r requirements.txt -r requirements-dev.txt
}
Start-Process -FilePath ".\.venv\Scripts\python.exe" -ArgumentList '-m', 'uvicorn', 'app.main:app', '--reload', '--port', $port -WorkingDirectory "$root\backend"
Pop-Location

Push-Location "$root\frontend"
if (-not (Test-Path node_modules)) { npm ci --no-audit --no-fund }
Write-Host "MathMind: web http://localhost:5173  ·  API http://localhost:$port/docs"
$env:VITE_PROXY_TARGET = "http://localhost:$port"
npm run dev
Pop-Location
