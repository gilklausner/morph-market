# Windows: reads this computer's id for MORPH, makes it when there is none, and prints the
# header with it. device-header.cmd calls it when it could not read the id by itself.
# The file is written as plain text with no mark at its start, so every reader of it
# (this, device-header.sh, device.mjs) sees the same 32 letters. Plain ASCII on purpose.
$ErrorActionPreference = "Stop"
$folder = Join-Path $env:USERPROFILE ".morph"
$file = Join-Path $folder "device"
$id = ""
if (Test-Path $file) { $id = ([string](Get-Content -Path $file -Raw)) -replace "\s", "" }
if ($id -cnotmatch "^[0-9a-f]{32}$") {
  $bytes = New-Object byte[] 16
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $id = -join ($bytes | ForEach-Object { $_.ToString("x2") })
  New-Item -ItemType Directory -Force -Path $folder | Out-Null
  [System.IO.File]::WriteAllText($file, "$id`n")
}
Write-Output "{`"X-Morph-Device`":`"$id`"}"
