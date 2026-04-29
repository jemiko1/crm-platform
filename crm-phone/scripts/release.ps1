# Build + ship a softphone release in a single atomic command.
#
# Usage:
#   .\scripts\release.ps1                 # build, upload to VM, create GitHub release
#   .\scripts\release.ps1 -NoGithub       # skip GH release
#   .\scripts\release.ps1 -NoVm           # build only (debug)
#
# Auto-update is served from the VM (https://crm28.asg.ge/downloads/phone/),
# not from GitHub releases. The GitHub release step is for changelog /
# audit trail only. See docs/SOFTPHONE_RELEASE_PROCEDURE.md.

param(
    [switch]$NoGithub,
    [switch]$NoVm,
    [switch]$Help
)

if ($Help) {
    @"
Usage: .\scripts\release.ps1 [flags]

Build + ship a softphone release in a single atomic command.

Flags:
  -NoGithub     skip the GitHub release step (still uploads to VM)
  -NoVm         skip the VM upload step (build only — debug)
  -Help         show this message

Env var overrides (defaults sufficient for production):
  SOFTPHONE_VM_USER   ssh user on the VM            (default: Administrator)
  SOFTPHONE_VM_HOST   VM IP / hostname              (default: 192.168.65.110)
  SOFTPHONE_VM_PATH   target dir on VM (must end /) (default: C:/crm/downloads/phone/)
  SOFTPHONE_SSH_KEY   path to private key           (default: ~/.ssh/id_ed25519_vm)

See docs/SOFTPHONE_RELEASE_PROCEDURE.md for the full procedure.
"@
    exit 0
}

$ErrorActionPreference = 'Stop'

# Resolve repo root regardless of where the script is invoked from
Set-Location (Join-Path $PSScriptRoot '..')

$pkg = Get-Content package.json -Raw | ConvertFrom-Json
$version = $pkg.version
$installer = "release/CRM28-Phone-Setup-$version.exe"
$blockmap = "$installer.blockmap"
$latestYml = "release/latest.yml"

$vmUser = if ($env:SOFTPHONE_VM_USER) { $env:SOFTPHONE_VM_USER } else { 'Administrator' }
$vmHost = if ($env:SOFTPHONE_VM_HOST) { $env:SOFTPHONE_VM_HOST } else { '192.168.65.110' }
$vmPath = if ($env:SOFTPHONE_VM_PATH) { $env:SOFTPHONE_VM_PATH } else { 'C:/crm/downloads/phone/' }
$sshKey = if ($env:SOFTPHONE_SSH_KEY) { $env:SOFTPHONE_SSH_KEY } else { Join-Path $HOME '.ssh/id_ed25519_vm' }

Write-Host "==> Building softphone v$version"
pnpm run build
if ($LASTEXITCODE -ne 0) { throw "pnpm run build failed" }
pnpm exec electron-builder --win
if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }

# Verify electron-builder produced what we expect at the names we expect.
foreach ($f in @($installer, $blockmap, $latestYml)) {
    if (-not (Test-Path $f)) {
        throw "$f missing — check artifactName in electron-builder.yml"
    }
}

# Cross-check: latest.yml's `path:` field must match what we'll upload.
$latestPath = (Select-String -Path $latestYml -Pattern '^path:\s*(.+)$' | Select-Object -First 1).Matches.Groups[1].Value.Trim()
$expectedPath = "CRM28-Phone-Setup-$version.exe"
if ($latestPath -ne $expectedPath) {
    throw "latest.yml says path=$latestPath but expected $expectedPath"
}

if ($NoVm) {
    Write-Host "==> Skipping VM upload (-NoVm)"
} else {
    Write-Host "==> Uploading to VM ($($vmHost):$vmPath)"
    if (-not (Test-Path $sshKey)) { throw "SSH key not found at $sshKey" }

    & scp -i $sshKey -o ConnectTimeout=15 $installer $blockmap $latestYml "$($vmUser)@$($vmHost):$vmPath"
    if ($LASTEXITCODE -ne 0) { throw "scp failed" }

    Write-Host "==> Verifying https://crm28.asg.ge/downloads/phone/latest.yml"
    # Cache-buster query string + no-cache header prevent any reverse
    # proxy from serving a stale copy of `latest.yml` for a few seconds
    # after upload (would falsely fail or falsely pass).
    $cb = "$PID-$(Get-Date -UFormat %s)"
    $headers = @{ 'Cache-Control' = 'no-cache'; 'Pragma' = 'no-cache' }
    $remoteYaml = Invoke-WebRequest -UseBasicParsing -Headers $headers `
        -Uri "https://crm28.asg.ge/downloads/phone/latest.yml?cb=$cb"
    $remoteVersionMatch = [regex]::Match($remoteYaml.Content, '(?m)^version:\s*(.+)$')
    $remoteVersion = if ($remoteVersionMatch.Success) { $remoteVersionMatch.Groups[1].Value.Trim() } else { '<unparsable>' }
    if ($remoteVersion -ne $version) {
        throw "VM serves version='$remoteVersion' after upload — expected $version. Auto-update will not work for this release."
    }
    Write-Host "    OK — VM serves v$version"
}

if ($NoGithub) {
    Write-Host "==> Skipping GitHub release (-NoGithub)"
} elseif (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Host "==> Skipping GitHub release (gh CLI not installed)"
} else {
    & gh auth status 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "==> Skipping GitHub release (gh not authenticated)"
    } else {
        $tag = "v$version"
        & gh release view $tag 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "==> Skipping GitHub release ($tag already exists)"
        } else {
            Write-Host "==> Creating GitHub release $tag"
            & gh release create $tag $installer $blockmap $latestYml `
                --title "CRM28 Phone v$version" `
                --notes "Auto-update is served from https://crm28.asg.ge/downloads/phone/. Operators get this release automatically on next launch — no manual download needed."
            if ($LASTEXITCODE -ne 0) { throw "gh release create failed" }
        }
    }
}

Write-Host ""
Write-Host "Done. v$version is live."
Write-Host "  Auto-update feed:  https://crm28.asg.ge/downloads/phone/latest.yml"
Write-Host "  Direct download:   https://crm28.asg.ge/downloads/phone/CRM28-Phone-Setup-$version.exe"
