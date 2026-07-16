@echo off
setlocal
set "ROOT=%~dp0"
set "SERVER_DIR=%ROOT%server"
cd /d "%ROOT%"

where python >nul 2>&1
if %errorlevel%==0 goto runpython
where py >nul 2>&1
if %errorlevel%==0 goto runpy
where node >nul 2>&1
if %errorlevel%==0 goto runnode
goto bad

:runpython
start "STG-HTTP-Server" /D "%SERVER_DIR%" cmd /k python server.py
goto afterstart

:runpy
start "STG-HTTP-Server" /D "%SERVER_DIR%" cmd /k py -3 server.py
goto afterstart

:runnode
start "STG-HTTP-Server" /D "%SERVER_DIR%" cmd /k node server.js
goto afterstart

:afterstart
ping 127.0.0.1 -n 3 >nul
start "" "http://localhost:8765/game_demo/index.html"
goto endok

:bad
echo ERROR: python, py, and node not in PATH. Install one, then retry.
echo Optional env check / install guide:
echo   powershell -ExecutionPolicy Bypass -File "%ROOT%server\stg-env-check.ps1"
pause
exit /b 1

:endok
ping 127.0.0.1 -n 6 >nul
endlocal
exit /b 0
