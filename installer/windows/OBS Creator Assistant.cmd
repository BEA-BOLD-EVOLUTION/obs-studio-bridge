@echo off
setlocal
cd /d "%~dp0"

:run
if exist "%~dp0.stop" exit /b 0
"%~dp0runtime\node.exe" "%~dp0dist\bootstrap.js"
timeout /t 3 /nobreak >nul
goto run


