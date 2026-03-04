@echo off
echo ============================================
echo   SSH Key Setup - One Time
echo   This will let the AI agent SSH freely
echo ============================================
echo.
echo Caching server host key...
echo y | plink -ssh root@5.10.34.153 "exit" 2>nul
echo.
echo Now copying your SSH key to the server.
echo Type the ROOT PASSWORD when prompted:
echo.
type "%USERPROFILE%\.ssh\id_ed25519.pub" | plink -ssh root@5.10.34.153 "mkdir -p ~/.ssh; cat >> ~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys"
echo.
echo ============================================
echo   Done! The AI agent can now SSH freely.
echo   Go back to Cursor and say "done"
echo ============================================
pause
