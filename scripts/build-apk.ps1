$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$MobileDir = Join-Path $RootDir "apps\mobile"
$BuildDir = Join-Path $MobileDir "build"

if (!(Test-Path $BuildDir)) {
    New-Item -ItemType Directory -Path $BuildDir | Out-Null
}

$Version = node -e "try { console.log(require('$($MobileDir.Replace('\','/'))/package.json').version || '0.1.0') } catch { console.log('0.1.0') }"
$BuildId = node -e "
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const hash = crypto.createHash('sha256').update('$Version');
const scanDirs = ['$($MobileDir.Replace('\','/'))/app', '$($MobileDir.Replace('\','/'))/src'];
for (const dir of scanDirs) {
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir, { recursive: true })) {
      const fp = path.join(dir, f);
      try {
        const s = fs.statSync(fp);
        if (s.isFile() && !f.includes('node_modules')) {
          hash.update(f);
          hash.update(String(s.mtimeMs));
          hash.update(String(s.size));
        }
      } catch {}
    }
  }
}
console.log(hash.digest('hex').slice(0, 8));
"

$VersionContent = @"
export const APP_VERSION = '$Version';
export const APP_BUILD_ID = '$BuildId';
"@

Set-Content -Path (Join-Path $MobileDir "src\version.js") -Value $VersionContent
Write-Host "Stamped apps/mobile/src/version.js -> Version: $Version, Build ID: $BuildId"

$Gradlew = Join-Path $MobileDir "android\gradlew.bat"
if (Test-Path $Gradlew) {
    Write-Host "Building Android APK via Gradle..."
    Push-Location (Join-Path $MobileDir "android")
    .\gradlew.bat assembleRelease
    Pop-Location
    Copy-Item (Join-Path $MobileDir "android\app\build\outputs\apk\release\app-release.apk") (Join-Path $BuildDir "ag-remote.apk")
    Write-Host "APK ready at $BuildDir\ag-remote.apk"
} else {
    Write-Host "To build standalone APK with EAS:"
    Write-Host "  cd apps/mobile; eas build --platform android --profile preview --local"
    Write-Host "When finished, copy the generated .apk file to $BuildDir\ag-remote.apk"
}
