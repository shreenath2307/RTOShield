# RTO Shield - start backend (FastAPI :8000) and frontend (Next.js :3000) dev servers.
# Usage:  powershell -ExecutionPolicy Bypass -File .\start.ps1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$Py = Join-Path $Backend ".venv\Scripts\python.exe"

if (-not (Test-Path $Py)) {
    Write-Host "Creating Python virtualenv..." -ForegroundColor Cyan
    Push-Location $Backend
    python -m venv .venv
    & $Py -m pip install --upgrade pip
    & $Py -m pip install -r requirements.txt
    Pop-Location
}

if (-not (Test-Path (Join-Path $Frontend "node_modules"))) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Cyan
    Push-Location $Frontend
    npm install
    Pop-Location
}

$env:DISABLE_SQLALCHEMY_CEXT_RUNTIME = "1"
Write-Host "Starting backend on http://localhost:8000 (docs: /docs)" -ForegroundColor Green
$be = Start-Process -FilePath $Py -ArgumentList "run.py" -WorkingDirectory $Backend -PassThru -NoNewWindow

Write-Host "Starting frontend on http://localhost:3000" -ForegroundColor Green
$fe = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev" -WorkingDirectory $Frontend -PassThru -NoNewWindow

Write-Host "Press Ctrl+C to stop both servers." -ForegroundColor Yellow
try {
    while (-not $be.HasExited -and -not $fe.HasExited) { Start-Sleep -Seconds 1 }
}
finally {
    foreach ($p in @($be, $fe)) {
        if ($p -and -not $p.HasExited) {
            # kill the whole process tree (npm spawns node children)
            & taskkill /PID $p.Id /T /F | Out-Null
        }
    }
}
