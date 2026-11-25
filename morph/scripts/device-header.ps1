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
  # The fingerprint of the machine id Windows gives the computer (device.mjs explains), so
  # the same computer always makes the same code. Without one, a random code.
  $machine = ""
  try {
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, [Microsoft.Win32.RegistryView]::Registry64)
    $machine = ([string]$base.OpenSubKey("SOFTWARE\Microsoft\Cryptography").GetValue("MachineGuid")).ToLowerInvariant()
  } catch { $machine = "" }
  if ($machine -cmatch "^[0-9a-f-]{36}$") {
    $hash = [System.Security.Cryptography.SHA256]::Create().ComputeHash([System.Text.Encoding]::UTF8.GetBytes("morph:$machine"))
    $id = (-join ($hash | ForEach-Object { $_.ToString("x2") })).Substring(0, 32)
  } else {
    $bytes = New-Object byte[] 16
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $id = -join ($bytes | ForEach-Object { $_.ToString("x2") })
  }
  New-Item -ItemType Directory -Force -Path $folder | Out-Null
  [System.IO.File]::WriteAllText($file, "$id`n")
}
Write-Output "{`"X-Morph-Device`":`"$id`"}"
