# CRM28 Health Check & Auto-Recovery
# Runs every 2 minutes via scheduled task

$logFile = "C:\crm\logs\health-check.log"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

function Log($msg) {
    "$timestamp | $msg" | Out-File -Append $logFile
    Write-Output $msg
}

function Test-Http($url, $name) {
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        return @{ Name = $name; Status = "UP"; Code = $response.StatusCode }
    } catch {
        return @{ Name = $name; Status = "DOWN"; Code = 0; Error = $_.Exception.Message }
    }
}

$issues = @()

# 1. Check PostgreSQL
try {
    $result = & C:\postgresql17\pgsql\bin\psql.exe -U postgres -c "SELECT 1;" -t 2>&1
    if ($LASTEXITCODE -ne 0) { throw "psql failed" }
} catch {
    Log "ALERT: PostgreSQL is DOWN. Attempting restart..."
    $issues += "PostgreSQL DOWN"
    try {
        & C:\postgresql17\pgsql\bin\pg_ctl.exe start -D "C:\postgresql17\data" -l "C:\postgresql17\pg.log" 2>&1
        Start-Sleep 5
        & C:\postgresql17\pgsql\bin\psql.exe -U postgres -c "SELECT 1;" -t 2>&1
        if ($LASTEXITCODE -eq 0) {
            Log "RECOVERED: PostgreSQL restarted successfully"
        } else {
            Log "CRITICAL: PostgreSQL restart FAILED. Manual intervention required."
        }
    } catch {
        Log "CRITICAL: PostgreSQL restart FAILED: $_"
    }
}

# 2. Check Nginx
$nginxSvc = Get-Service nginx -ErrorAction SilentlyContinue
if ($nginxSvc.Status -ne 'Running') {
    Log "ALERT: Nginx is DOWN. Attempting restart..."
    $issues += "Nginx DOWN"
    try {
        Start-Service nginx -ErrorAction Stop
        Start-Sleep 3
        $nginxSvc = Get-Service nginx
        if ($nginxSvc.Status -eq 'Running') {
            Log "RECOVERED: Nginx restarted successfully"
        }
    } catch {
        Log "CRITICAL: Nginx restart FAILED: $_"
    }
}

# 3. Check CRM Backend (via HTTP)
$backend = Test-Http "http://127.0.0.1:3000/health" "CRM Backend"
if ($backend.Status -eq "DOWN") {
    Log "ALERT: CRM Backend is DOWN. Attempting PM2 restart..."
    $issues += "Backend DOWN"
    pm2 restart crm-backend 2>&1
    Start-Sleep 10
    $retry = Test-Http "http://127.0.0.1:3000/health" "CRM Backend"
    if ($retry.Status -eq "UP") {
        Log "RECOVERED: CRM Backend restarted successfully"
    } else {
        Log "CRITICAL: CRM Backend restart FAILED. Check logs: pm2 logs crm-backend"
    }
}

# 4. Check CRM Frontend (via HTTP)
$frontend = Test-Http "http://127.0.0.1:4002" "CRM Frontend"
if ($frontend.Status -eq "DOWN") {
    Log "ALERT: CRM Frontend is DOWN. Attempting PM2 restart..."
    $issues += "Frontend DOWN"
    pm2 restart crm-frontend 2>&1
    Start-Sleep 10
    $retry = Test-Http "http://127.0.0.1:4002" "CRM Frontend"
    if ($retry.Status -eq "UP") {
        Log "RECOVERED: CRM Frontend restarted successfully"
    } else {
        Log "CRITICAL: CRM Frontend restart FAILED. Check logs: pm2 logs crm-frontend"
    }
}

# 5. Check Nginx proxy (end-to-end via HTTPS)
$proxy = Test-Http "https://crm28.asg.ge/health" "Nginx Proxy"
if ($proxy.Status -eq "DOWN" -and $backend.Status -eq "UP") {
    Log "ALERT: Nginx proxy broken (backend UP but proxy DOWN). Restarting Nginx..."
    Restart-Service nginx -ErrorAction SilentlyContinue
}

# 6. Check memory
$os = Get-CimInstance Win32_OperatingSystem
$memPct = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize * 100)
if ($memPct -gt 90) {
    Log "WARNING: Memory usage at ${memPct}%. Consider restarting services or increasing VM RAM."
    $issues += "High memory (${memPct}%)"
}

# 7. Check disk space
$disk = Get-PSDrive C
$diskPct = [math]::Round($disk.Used / ($disk.Used + $disk.Free) * 100)
if ($diskPct -gt 85) {
    Log "WARNING: Disk usage at ${diskPct}%. Consider cleaning old logs/backups."
    $issues += "High disk (${diskPct}%)"
}

# Summary
if ($issues.Count -eq 0) {
    # Only log OK every 30 minutes to keep log clean
    $minute = (Get-Date).Minute
    if ($minute -lt 2 -or ($minute -ge 30 -and $minute -lt 32)) {
        Log "OK: All services healthy | Memory: ${memPct}% | Disk: ${diskPct}%"
    }
} else {
    Log "ISSUES FOUND: $($issues -join ', ')"
}

# Trim log file (keep last 1000 lines)
if (Test-Path $logFile) {
    $lines = Get-Content $logFile -Tail 1000
    $lines | Set-Content $logFile
}
