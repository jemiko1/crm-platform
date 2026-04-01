# CRM28 Automated Database Backup
# Runs daily, keeps 7 days of backups

$backupDir = "C:\crm\backups"
$pgDump = "C:\postgresql17\pgsql\bin\pg_dump.exe"
$date = Get-Date -Format "yyyy-MM-dd_HHmmss"
$backupFile = "$backupDir\crm-backup-$date.dump"

# Ensure backup directory exists
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

# Create backup
Write-Output "[$(Get-Date)] Starting backup..."
& $pgDump -U postgres -d crm -Fc -f $backupFile 2>&1

if ($LASTEXITCODE -eq 0) {
    $size = (Get-Item $backupFile).Length / 1MB
    Write-Output "[$(Get-Date)] Backup created: $backupFile ({0:N1} MB)" -f $size
} else {
    Write-Output "[$(Get-Date)] ERROR: Backup failed with exit code $LASTEXITCODE"
    exit 1
}

# Clean up old backups (keep last 7 days)
$cutoff = (Get-Date).AddDays(-7)
Get-ChildItem $backupDir -Filter "crm-backup-*.dump" |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    ForEach-Object {
        Write-Output "[$(Get-Date)] Removing old backup: $($_.Name)"
        Remove-Item $_.FullName -Force
    }

Write-Output "[$(Get-Date)] Backup complete. Current backups:"
Get-ChildItem $backupDir -Filter "*.dump" | Sort-Object LastWriteTime -Descending |
    ForEach-Object { Write-Output "  $($_.Name) - $([math]::Round($_.Length / 1MB, 1)) MB" }
