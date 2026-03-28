@echo off
setlocal

set "SCRIPT_DIR=%~dp0"

echo Starting local HTTP server...

where python >nul 2>&1
if %errorlevel%==0 (
  python "%SCRIPT_DIR%server.py"
  goto :eof
)

where node >nul 2>&1
if %errorlevel%==0 (
  node "%SCRIPT_DIR%server.js"
  goto :eof
)

echo Error: neither "python" nor "node" is available in PATH.
echo Please install one of them and try again.
pause
exit /b 1
