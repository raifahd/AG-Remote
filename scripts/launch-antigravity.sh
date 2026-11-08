#!/usr/bin/env bash
set -euo pipefail

DEBUG_PORT="${AG_DEBUG_PORT:-9222}"

find_antigravity_bin() {
  if [[ -x "/opt/antigravity-ide/antigravity-ide" ]]; then
    echo "/opt/antigravity-ide/antigravity-ide"
    return 0
  fi
  if command -v antigravity-ide >/dev/null 2>&1; then
    command -v antigravity-ide
    return 0
  fi
  if command -v antigravity >/dev/null 2>&1; then
    command -v antigravity
    return 0
  fi
  echo ""
}

AG_BIN="$(find_antigravity_bin)"
if [[ -z "$AG_BIN" ]]; then
  echo "Error: Antigravity IDE executable not found in /opt/antigravity-ide or PATH." >&2
  exit 1
fi

write_desktop_override() {
  local apps_dir="${HOME}/.local/share/applications"
  local desktop_file="${apps_dir}/antigravity.desktop"
  mkdir -p "$apps_dir"

  cat <<EOF > "$desktop_file"
[Desktop Entry]
Name=Antigravity IDE (Remote Debug)
Comment=Google's AI-powered IDE with CDP Remote Debugging
GenericName=IDE
Exec=${AG_BIN} --remote-debugging-port=${DEBUG_PORT} %F
Icon=/usr/share/pixmaps/antigravity.png
Type=Application
Terminal=false
StartupNotify=true
StartupWMClass=antigravity-ide
Categories=Development;IDE;TextEditor;
MimeType=text/plain;
EOF

  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$apps_dir" >/dev/null 2>&1 || true
  fi
}

write_desktop_override

echo "Launching Antigravity IDE with --remote-debugging-port=${DEBUG_PORT}..."
exec env -u ELECTRON_RUN_AS_NODE "$AG_BIN" "--remote-debugging-port=${DEBUG_PORT}" "$@"

