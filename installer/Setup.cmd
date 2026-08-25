@echo off
setlocal
title OBS Creator Assistant Developer Setup Harness
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-creator.ps1" -DeveloperHarness
if errorlevel 1 (
  echo.
  echo Setup could not finish. Please copy this window or take a screenshot for support.
  pause
  exit /b 1
)
echo.
echo Setup finished successfully.
pause
