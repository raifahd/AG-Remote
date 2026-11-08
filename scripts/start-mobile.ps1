$ErrorActionPreference = "Stop"

$tailscaleIp = $null
try {
  $output = & tailscale ip -4 2>$null
  if ($LASTEXITCODE -eq 0 -and $output) {
    $tailscaleIp = $output.Trim()
  }
} catch {
  $tailscaleIp = $null
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $scriptDir "..\apps\mobile")

if ($tailscaleIp) {
  Write-Host "Starting Expo with Tailscale IP: $tailscaleIp"
  $env:REACT_NATIVE_PACKAGER_HOSTNAME = $tailscaleIp
  & npx expo start --host lan --clear
} else {
  Write-Host "Tailscale not detected, running with default host."
  & npx expo start --clear
}
