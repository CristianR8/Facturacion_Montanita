@echo off
setlocal

set "ROOT=%~dp0"
set "SERVICE=postgresql-x64-17"
set "ELECTRON_CMD=%ROOT%node_modules\.bin\electron.cmd"
set "ELECTRON_RUN_AS_NODE="

sc query "%SERVICE%" | find "RUNNING" >nul 2>&1
if errorlevel 1 (
  net start "%SERVICE%" >nul 2>&1
)

if not exist "%ELECTRON_CMD%" (
  echo No se encontro Electron en %ELECTRON_CMD%
  exit /b 1
)

start "" /D "%ROOT%" cmd /c ""%ELECTRON_CMD%" ."
exit /b 0
