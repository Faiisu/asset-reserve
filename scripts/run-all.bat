@echo off
setlocal
cd /d "%~dp0"
node run-all.mjs
if %ERRORLEVEL% neq 0 (
    echo.
    echo Script ended with error code %ERRORLEVEL%
    pause
)
