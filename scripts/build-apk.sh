#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_DIR="$ROOT_DIR/apps/mobile"
BUILD_DIR="$MOBILE_DIR/build"

mkdir -p "$BUILD_DIR"

VERSION=$(node -e "try { console.log(require('$MOBILE_DIR/package.json').version || '0.1.0') } catch { console.log('0.1.0') }")
BUILD_ID=$(node -e "
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const hash = crypto.createHash('sha256').update('$VERSION');
const scanDirs = ['$MOBILE_DIR/app', '$MOBILE_DIR/src'];
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
")

cat <<EOF > "$MOBILE_DIR/src/version.js"
export const APP_VERSION = '$VERSION';
export const APP_BUILD_ID = '$BUILD_ID';
EOF

echo "Stamped apps/mobile/src/version.js -> Version: $VERSION, Build ID: $BUILD_ID"

if [ -f "$MOBILE_DIR/android/gradlew" ]; then
  echo "Building Android APK via Gradle..."
  cd "$MOBILE_DIR/android"
  ./gradlew assembleRelease
  cp app/build/outputs/apk/release/app-release.apk "$BUILD_DIR/ag-remote.apk"
  echo "APK ready at $BUILD_DIR/ag-remote.apk"
else
  echo "To build standalone APK with EAS:"
  echo "  cd apps/mobile && eas build --platform android --profile preview --local"
  echo "When finished, copy the generated .apk file to $BUILD_DIR/ag-remote.apk"
fi
