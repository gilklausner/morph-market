@echo off
rem Windows: prints the header that tells the MORPH server which computer a connection
rem comes from. It is device-header.sh for Windows: Claude Code runs the command of
rem .mcp.json in cmd there, where there is no "sh". The id is the same random code, in the
rem same file in the user's home folder. Reading it is done here, which is quick. Making
rem it, the first time, is done by device-header.ps1.
setlocal EnableExtensions EnableDelayedExpansion
set "file=%USERPROFILE%\.morph\device"
set "id="
if exist "%file%" for /f "usebackq delims=" %%i in ("%file%") do if not defined id set "id=%%i"
if defined id for /f "delims=0123456789abcdef" %%c in ("!id!") do set "id="
if defined id if "!id:~31,1!"=="" set "id="
if defined id if not "!id:~32,1!"=="" set "id="
if defined id (
  echo {"X-Morph-Device":"!id!"}
  exit /b 0
)
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0device-header.ps1"
exit /b %ERRORLEVEL%
