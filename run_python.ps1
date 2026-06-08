param(
    [switch]$Install,
    [string]$Host = "127.0.0.1",
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvDir = Join-Path $projectDir ".venv"
$pythonExe = Join-Path $venvDir "Scripts\python.exe"

Set-Location $projectDir

if ($Install -or -not (Test-Path -LiteralPath $pythonExe)) {
    Write-Host "Creating/updating Python environment..."
    python -m venv $venvDir
    & $pythonExe -m pip install --upgrade pip
    & $pythonExe -m pip install -r (Join-Path $projectDir "requirements.txt")
}

if (-not (Test-Path -LiteralPath (Join-Path $projectDir "model\best_model.pt"))) {
    Write-Host ""
    Write-Host "Warning: model\best_model.pt was not found."
    Write-Host "The API can still start, but CNN predictions may use fallback behavior."
    Write-Host ""
}

Write-Host "Starting Python API: http://$Host`:$Port"
& $pythonExe -m fractal_3d.api_server --host $Host --port $Port
