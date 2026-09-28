@echo off
setlocal

where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Windows PowerShell was not found.
  echo.
  pause
  exit /b 1
)

rem Keep PowerShell open even if the signing script has a parse/runtime error.
powershell.exe -NoLogo -NoProfile -NoExit -ExecutionPolicy Bypass -File "%~dp0sign-portable-launcher.ps1"

endlocal
