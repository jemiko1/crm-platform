# CRM28 PM2 Startup Script
# Run at system startup via Windows Task Scheduler to ensure all PM2 processes start.
#
# Setup (run once as Administrator on the VM):
#   $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File C:\crm\scripts\pm2-startup.ps1"
#   $trigger = New-ScheduledTaskTrigger -AtStartup
#   $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
#   $principal = New-ScheduledTaskPrincipal -UserId "Administrator" -RunLevel Highest -LogonType ServiceAccount
#   Register-ScheduledTask -TaskName "PM2 Startup - CRM28" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Starts all CRM28 PM2 services on boot"

$logFile = "C:\crm\logs\pm2-startup.log"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

function Log($msg) {
    "$timestamp | $msg" | Out-File -Append $logFile
    Write-Output $msg
}

Log "=== PM2 Startup Script BEGIN ==="

# Wait for network and system to settle
Start-Sleep -Seconds 15

# 1. Start PostgreSQL (if not already running as a service)
Log "Checking PostgreSQL..."
try {
    $pgResult = & C:\postgresql17\pgsql\bin\psql.exe -U postgres -c "SELECT 1;" -t 2>&1
    if ($LASTEXITCODE -eq 0) {
        Log "PostgreSQL already running"
    } else {
        throw "not running"
    }
} catch {
    Log "Starting PostgreSQL..."
    & C:\postgresql17\pgsql\bin\pg_ctl.exe start -D "C:\postgresql17\data" -l "C:\postgresql17\pg.log" 2>&1
    Start-Sleep -Seconds 10
    $pgResult = & C:\postgresql17\pgsql\bin\psql.exe -U postgres -c "SELECT 1;" -t 2>&1
    if ($LASTEXITCODE -eq 0) {
        Log "PostgreSQL started OK"
    } else {
        Log "CRITICAL: PostgreSQL failed to start!"
    }
}

# 2. Start Nginx
Log "Checking Nginx..."
$nginxSvc = Get-Service nginx -ErrorAction SilentlyContinue
if ($nginxSvc -and $nginxSvc.Status -ne 'Running') {
    Log "Starting Nginx..."
    Start-Service nginx -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    $nginxSvc = Get-Service nginx
    if ($nginxSvc.Status -eq 'Running') {
        Log "Nginx started OK"
    } else {
        Log "WARNING: Nginx failed to start"
    }
} elseif ($nginxSvc) {
    Log "Nginx already running"
} else {
    Log "WARNING: Nginx service not found"
}

# 3. Resurrect PM2 saved processes (this restores the dump)
Log "Resurrecting PM2 processes..."
pm2 resurrect 2>&1 | Out-Null
Start-Sleep -Seconds 5

# 4. Check if all expected processes are running, start missing ones
$expected = @(
    @{ name = "crm-backend";      ecosystem = "C:\crm\ecosystem.config.js" },
    @{ name = "crm-frontend";     ecosystem = "C:\crm\ecosystem.config.js" },
    @{ name = "ami-bridge";       ecosystem = "C:\ami-bridge\ecosystem.config.js" },
    @{ name = "core-sync-bridge"; ecosystem = "C:\core-sync-bridge\ecosystem.config.js" },
    @{ name = "crm-monitor";      script = "C:\crm\crm-monitor\server.js" }
)

$pm2List = pm2 jlist 2>&1 | ConvertFrom-Json -ErrorAction SilentlyContinue
$runningNames = @()
if ($pm2List) { $runningNames = $pm2List | ForEach-Object { $_.name } }

foreach ($svc in $expected) {
    if ($runningNames -contains $svc.name) {
        $proc = $pm2List | Where-Object { $_.name -eq $svc.name }
        $status = $proc.pm2_env.status
        if ($status -eq "online") {
            Log "$($svc.name): already online"
        } else {
            Log "$($svc.name): status=$status, restarting..."
            pm2 restart $svc.name 2>&1 | Out-Null
        }
    } else {
        Log "$($svc.name): NOT in PM2, starting..."
        if ($svc.ecosystem -and (Test-Path $svc.ecosystem)) {
            pm2 start $svc.ecosystem --only $svc.name 2>&1 | Out-Null
            Log "$($svc.name): started from ecosystem"
        } elseif ($svc.script -and (Test-Path $svc.script)) {
            pm2 start $svc.script --name $svc.name 2>&1 | Out-Null
            Log "$($svc.name): started from script"
        } else {
            Log "WARNING: $($svc.name) — no ecosystem or script file found"
        }
    }
}

# 5. Save state so next resurrect picks it all up
Start-Sleep -Seconds 5
pm2 save 2>&1 | Out-Null
Log "PM2 state saved"

# 6. Final status
$finalList = pm2 jlist 2>&1 | ConvertFrom-Json -ErrorAction SilentlyContinue
if ($finalList) {
    foreach ($p in $finalList) {
        Log "  $($p.name): $($p.pm2_env.status) (PID $($p.pid))"
    }
}

Log "=== PM2 Startup Script END ==="
