# ══════════════════════════════════════════════════════════
#  Deploy Bridges to VM 192.168.65.110
#
#  Deploys:
#   1. AMI Bridge       → C:\ami-bridge       (port 3100 health)
#   2. Core Sync Bridge → C:\core-sync-bridge  (port 3101 health)
#   3. Bridge Monitor   → C:\bridge-monitor    (port 3200 dashboard)
#
#  Prerequisites:
#   - SSH key at ~/.ssh/id_ed25519_vm
#   - Node.js 22 on VM
#   - PM2 on VM
#   - OpenVPN connected
#
#  Usage: .\deploy-bridges.ps1 [-Component all|ami|core|monitor]
# ══════════════════════════════════════════════════════════

param(
    [ValidateSet("all", "ami", "core", "monitor")]
    [string]$Component = "all"
)

$ErrorActionPreference = "Stop"
$VM = "Administrator@192.168.65.110"
$KEY = "$HOME\.ssh\id_ed25519_vm"
$SSH = "ssh -i $KEY -o StrictHostKeyChecking=no -o ConnectTimeout=10 $VM"
$SCP = "scp -i $KEY -o StrictHostKeyChecking=no -r"
$LOCAL_ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Step($n, $msg) {
    Write-Host "`n[$n] $msg" -ForegroundColor Cyan
}

function SSH-Cmd($cmd) {
    $result = Invoke-Expression "$SSH `"$cmd`"" 2>&1
    return $result
}

# ── Test connectivity ────────────────────────────────────
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Bridge Deployment to VM 192.168.65.110" -ForegroundColor Cyan
Write-Host "  Component: $Component" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan

Write-Step "0" "Testing SSH connection..."
$nodeVer = SSH-Cmd "node --version"
if ($LASTEXITCODE -ne 0) {
    Write-Host "  SSH connection failed. Check VPN and key." -ForegroundColor Red
    exit 1
}
Write-Host "  Connected. Node.js: $nodeVer" -ForegroundColor Green

# ── Deploy AMI Bridge ────────────────────────────────────
if ($Component -eq "all" -or $Component -eq "ami") {
    Write-Step "1" "Deploying AMI Bridge..."

    # Build locally first
    Write-Host "  Building locally..." -ForegroundColor Yellow
    Push-Location "$LOCAL_ROOT\ami-bridge"
    pnpm install --frozen-lockfile 2>&1 | Out-Null
    pnpm build 2>&1 | Out-Null
    Pop-Location
    Write-Host "  Build complete" -ForegroundColor Green

    # Create dir on VM
    SSH-Cmd "if (-not (Test-Path 'C:\ami-bridge')) { New-Item -ItemType Directory -Path 'C:\ami-bridge' -Force }"
    SSH-Cmd "if (-not (Test-Path 'C:\ami-bridge\logs')) { New-Item -ItemType Directory -Path 'C:\ami-bridge\logs' -Force }"

    # Copy files
    Write-Host "  Copying files to VM..." -ForegroundColor Yellow
    Invoke-Expression "$SCP `"$LOCAL_ROOT\ami-bridge\dist`" `"${VM}:C:\ami-bridge\`""
    Invoke-Expression "$SCP `"$LOCAL_ROOT\ami-bridge\package.json`" `"${VM}:C:\ami-bridge\`""
    Invoke-Expression "$SCP `"$LOCAL_ROOT\ami-bridge\pnpm-lock.yaml`" `"${VM}:C:\ami-bridge\`""
    Invoke-Expression "$SCP `"$LOCAL_ROOT\ami-bridge\ecosystem.config.js`" `"${VM}:C:\ami-bridge\`""
    Invoke-Expression "$SCP `"$LOCAL_ROOT\ami-bridge\.env.example`" `"${VM}:C:\ami-bridge\`""

    # Copy .env only if it doesn't exist on VM (don't overwrite prod config)
    $envExists = SSH-Cmd "Test-Path 'C:\ami-bridge\.env'"
    if ($envExists -match "False") {
        Write-Host "  Copying .env (first deploy)..." -ForegroundColor Yellow
        Invoke-Expression "$SCP `"$LOCAL_ROOT\ami-bridge\.env`" `"${VM}:C:\ami-bridge\`""
    } else {
        Write-Host "  .env already exists on VM, skipping (won't overwrite)" -ForegroundColor Yellow
    }

    # Install production dependencies on VM
    Write-Host "  Installing dependencies on VM..." -ForegroundColor Yellow
    SSH-Cmd "cd C:\ami-bridge; npm install --omit=dev"

    Write-Host "  AMI Bridge deployed" -ForegroundColor Green
}

# ── Deploy Core Sync Bridge ─────────────────────────────
if ($Component -eq "all" -or $Component -eq "core") {
    Write-Step "2" "Deploying Core Sync Bridge..."

    # Build locally
    Write-Host "  Building locally..." -ForegroundColor Yellow
    Push-Location "$LOCAL_ROOT\core-sync-bridge"
    pnpm install --frozen-lockfile 2>&1 | Out-Null
    pnpm build 2>&1 | Out-Null
    Pop-Location
    Write-Host "  Build complete" -ForegroundColor Green

    # Create logs dir
    SSH-Cmd "if (-not (Test-Path 'C:\core-sync-bridge\logs')) { New-Item -ItemType Directory -Path 'C:\core-sync-bridge\logs' -Force }"

    # Copy built files (dist + package + ecosystem)
    Write-Host "  Copying files to VM..." -ForegroundColor Yellow
    Invoke-Expression "$SCP `"$LOCAL_ROOT\core-sync-bridge\dist`" `"${VM}:C:\core-sync-bridge\`""
    Invoke-Expression "$SCP `"$LOCAL_ROOT\core-sync-bridge\package.json`" `"${VM}:C:\core-sync-bridge\`""
    Invoke-Expression "$SCP `"$LOCAL_ROOT\core-sync-bridge\ecosystem.config.js`" `"${VM}:C:\core-sync-bridge\`""

    # Reinstall deps on VM to pick up any changes
    Write-Host "  Installing dependencies on VM..." -ForegroundColor Yellow
    SSH-Cmd "cd C:\core-sync-bridge; npm install --omit=dev"

    Write-Host "  Core Sync Bridge deployed" -ForegroundColor Green
}

# ── Deploy Bridge Monitor ────────────────────────────────
if ($Component -eq "all" -or $Component -eq "monitor") {
    Write-Step "3" "Deploying Bridge Monitor..."

    # Create dir on VM
    SSH-Cmd "if (-not (Test-Path 'C:\bridge-monitor')) { New-Item -ItemType Directory -Path 'C:\bridge-monitor' -Force }"
    SSH-Cmd "if (-not (Test-Path 'C:\bridge-monitor\logs')) { New-Item -ItemType Directory -Path 'C:\bridge-monitor\logs' -Force }"

    # Copy files (plain JS, no build needed)
    Write-Host "  Copying files to VM..." -ForegroundColor Yellow
    Invoke-Expression "$SCP `"$LOCAL_ROOT\bridge-monitor\server.js`" `"${VM}:C:\bridge-monitor\`""
    Invoke-Expression "$SCP `"$LOCAL_ROOT\bridge-monitor\dashboard.html`" `"${VM}:C:\bridge-monitor\`""
    Invoke-Expression "$SCP `"$LOCAL_ROOT\bridge-monitor\package.json`" `"${VM}:C:\bridge-monitor\`""
    Invoke-Expression "$SCP `"$LOCAL_ROOT\bridge-monitor\ecosystem.config.js`" `"${VM}:C:\bridge-monitor\`""

    Write-Host "  Bridge Monitor deployed" -ForegroundColor Green
}

# ── Start/Restart PM2 processes ──────────────────────────
Write-Step "4" "Starting PM2 processes..."

if ($Component -eq "all" -or $Component -eq "ami") {
    Write-Host "  Starting ami-bridge..." -ForegroundColor Yellow
    SSH-Cmd "cd C:\ami-bridge; pm2 delete ami-bridge 2>`$null; pm2 start ecosystem.config.js"
}

if ($Component -eq "all" -or $Component -eq "core") {
    Write-Host "  Starting core-sync-bridge..." -ForegroundColor Yellow
    SSH-Cmd "cd C:\core-sync-bridge; pm2 delete core-sync-bridge 2>`$null; pm2 start ecosystem.config.js"
}

if ($Component -eq "all" -or $Component -eq "monitor") {
    Write-Host "  Starting bridge-monitor..." -ForegroundColor Yellow
    SSH-Cmd "cd C:\bridge-monitor; pm2 delete bridge-monitor 2>`$null; pm2 start ecosystem.config.js"
}

# Save PM2 process list for auto-start on reboot
SSH-Cmd "pm2 save"

Write-Step "5" "Verifying..."
$pm2List = SSH-Cmd "pm2 list"
Write-Host $pm2List

Write-Host "`n════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  Deployment complete!" -ForegroundColor Green
Write-Host "" -ForegroundColor Green
Write-Host "  Dashboard: http://192.168.65.110:3200" -ForegroundColor White
Write-Host "  AMI Bridge health: http://192.168.65.110:3100/health" -ForegroundColor White
Write-Host "  Core Sync health:  http://192.168.65.110:3101/health" -ForegroundColor White
Write-Host "════════════════════════════════════════════" -ForegroundColor Green
