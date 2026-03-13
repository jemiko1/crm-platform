Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  SSH Key Setup for AI Agent" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$server = "5.10.34.153"
$pubkey = Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub"

Write-Host "Your public key:" -ForegroundColor Yellow
Write-Host $pubkey
Write-Host ""
Write-Host "Enter the ROOT password for $server" -ForegroundColor Yellow
$pass = Read-Host -AsSecureString "Password"
$plainPass = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($pass))

Write-Host ""
Write-Host "Copying SSH key to server..." -ForegroundColor Yellow

# Cache host key and copy SSH public key
$cmd = "mkdir -p ~/.ssh; echo '$pubkey' >> ~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys; echo DONE"
echo y | & "C:\Program Files\PuTTY\plink.exe" -ssh -pw $plainPass root@$server $cmd 2>&1

Write-Host ""
Write-Host "Testing key-based login..." -ForegroundColor Yellow
$test = ssh -o BatchMode=yes -o ConnectTimeout=5 root@$server "echo SUCCESS" 2>&1
if ($test -match "SUCCESS") {
    Write-Host "SUCCESS! Key auth works." -ForegroundColor Green
} else {
    Write-Host "Key auth test result: $test" -ForegroundColor Red
}

Write-Host ""
Write-Host "Go back to Cursor and say 'done'" -ForegroundColor Cyan
Read-Host "Press Enter to close"
