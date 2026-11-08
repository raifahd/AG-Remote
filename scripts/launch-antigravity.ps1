$ErrorActionPreference = "Stop"

$debugPort = if ($env:AG_DEBUG_PORT) { $env:AG_DEBUG_PORT } else { "9222" }

function Find-AntigravityBin {
    $candidates = @(
        "$env:LOCALAPPDATA\Programs\Antigravity\Antigravity.exe",
        "$env:PROGRAMFILES\Antigravity\Antigravity.exe",
        "$env:PROGRAMFILES(X86)\Antigravity\Antigravity.exe",
        "$env:LOCALAPPDATA\Programs\antigravity-ide\antigravity-ide.exe"
    )

    foreach ($path in $candidates) {
        if (Test-Path $path) {
            return $path
        }
    }

    $cmd = Get-Command antigravity -ErrorAction SilentlyContinue
    if ($cmd) {
        return $cmd.Source
    }

    return $null
}

$agBin = Find-AntigravityBin
if (-not $agBin) {
    Write-Error "Antigravity IDE executable not found in default paths or PATH."
    exit 1
}

Write-Host "Launching Antigravity IDE with --remote-debugging-port=$debugPort..."
$launchArgs = @("--remote-debugging-port=$debugPort") + $args
& $agBin $launchArgs

