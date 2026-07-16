@echo off
setlocal

set "SCRIPT_DIR=%~dp0"

echo Starting local HTTP server...

where python >nul 2>&1
if %errorlevel%==0 (
  python "%SCRIPT_DIR%server.py"
  goto :eof
)

where py >nul 2>&1
if %errorlevel%==0 (
  py -3 "%SCRIPT_DIR%server.py"
  goto :eof
)

where node >nul 2>&1
if %errorlevel%==0 (
  node "%SCRIPT_DIR%server.js"
  goto :eof
)

echo Error: neither "python" nor "py" nor "node" is available in PATH.
echo Install Python or Node.js, or run optional script:
echo   powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%stg-env-check.ps1"
pause
exit /b 1
