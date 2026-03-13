# ══════════════════════════════════════════════════════════
# Windows VM Setup Script for AMI Bridge
# Run this in PowerShell as Administrator on the VM
#
# Prerequisites:
#   - Internet access to github.com, registry.npmjs.org
#   - Git installed (or will be installed)
# ══════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"

Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  AMI Bridge - Windows VM Setup" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# ── 1. Check / Install Node.js ────────────────────────────
Write-Host "[1/6] Checking Node.js..." -ForegroundColor Yellow

$nodeVersion = $null
try { $nodeVersion = (node --version 2>$null) } catch {}

if ($nodeVersion -and $nodeVersion -match "^v2[2-9]") {
    Write-Host "  Node.js $nodeVersion is installed" -ForegroundColor Green
} else {
    Write-Host "  Installing Node.js 22 LTS..." -ForegroundColor Yellow
    $nodeInstaller = "$env:TEMP\node-installer.msi"
    Invoke-WebRequest -Uri "https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi" -OutFile $nodeInstaller
    Start-Process msiexec.exe -Wait -ArgumentList "/i $nodeInstaller /quiet /norestart"
    Remove-Item $nodeInstaller -Force

    # Refresh PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
    Write-Host "  Node.js installed: $(node --version)" -ForegroundColor Green
}
Write-Host ""

# ── 2. Check / Install Git ────────────────────────────────
Write-Host "[2/6] Checking Git..." -ForegroundColor Yellow

$gitVersion = $null
try { $gitVersion = (git --version 2>$null) } catch {}

if ($gitVersion) {
    Write-Host "  $gitVersion" -ForegroundColor Green
} else {
    Write-Host "  Git not found. Please install Git for Windows:" -ForegroundColor Red
    Write-Host "  https://git-scm.com/download/win" -ForegroundColor Red
    Write-Host "  Then re-run this script." -ForegroundColor Red
    exit 1
}
Write-Host ""

# ── 3. Install pnpm ───────────────────────────────────────
Write-Host "[3/6] Installing pnpm..." -ForegroundColor Yellow
npm install -g pnpm@latest 2>$null
Write-Host "  pnpm $(pnpm --version)" -ForegroundColor Green
Write-Host ""

# ── 4. Install PM2 ────────────────────────────────────────
Write-Host "[4/6] Installing PM2 (process manager)..." -ForegroundColor Yellow
npm install -g pm2 2>$null
Write-Host "  PM2 installed" -ForegroundColor Green
Write-Host ""

# ── 5. Clone or update repository ─────────────────────────
Write-Host "[5/6] Setting up repository..." -ForegroundColor Yellow
$repoDir = "C:\CRM-Platform"

if (Test-Path "$repoDir\.git") {
    Write-Host "  Repository exists, pulling latest..." -ForegroundColor Yellow
    Push-Location $repoDir
    git pull
    Pop-Location
} else {
    Write-Host "  Cloning repository..." -ForegroundColor Yellow
    Write-Host "  NOTE: You will need to provide your GitHub credentials or SSH key" -ForegroundColor Yellow
    git clone https://github.com/YOUR_ORG/CRM-Platform.git $repoDir
}
Write-Host ""

# ── 6. Install bridge dependencies ────────────────────────
Write-Host "[6/6] Installing AMI Bridge dependencies..." -ForegroundColor Yellow
Push-Location "$repoDir\ami-bridge"

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "  Created .env from .env.example" -ForegroundColor Yellow
    Write-Host "  >>> EDIT .env WITH YOUR ACTUAL VALUES BEFORE STARTING <<<" -ForegroundColor Red
}

pnpm install
pnpm build
Pop-Location
Write-Host "  Dependencies installed and built" -ForegroundColor Green
Write-Host ""

# ── Done ──────────────────────────────────────────────────
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Setup complete!" -ForegroundColor Cyan
Write-Host "" -ForegroundColor Cyan
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "  1. Edit C:\CRM-Platform\ami-bridge\.env" -ForegroundColor White
Write-Host "     - Set AMI_HOST, AMI_SECRET" -ForegroundColor White
Write-Host "     - Set CRM_BASE_URL, TELEPHONY_INGEST_SECRET" -ForegroundColor White
Write-Host "" -ForegroundColor White
Write-Host "  2. Test connection:" -ForegroundColor White
Write-Host "     cd C:\CRM-Platform\ami-bridge" -ForegroundColor White
Write-Host "     pnpm dev" -ForegroundColor White
Write-Host "" -ForegroundColor White
Write-Host "  3. Run as service with PM2:" -ForegroundColor White
Write-Host "     cd C:\CRM-Platform\ami-bridge" -ForegroundColor White
Write-Host "     pm2 start dist\main.js --name ami-bridge" -ForegroundColor White
Write-Host "     pm2 save" -ForegroundColor White
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
