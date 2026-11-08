#!/usr/bin/env bash
set -euo pipefail

TAILSCALE_IP="$(tailscale ip -4 2>/dev/null || true)"
cd "$(dirname "$0")/../apps/mobile"

if [[ -n "$TAILSCALE_IP" ]]; then
  echo "Starting Expo with Tailscale IP: ${TAILSCALE_IP}"
  export REACT_NATIVE_PACKAGER_HOSTNAME="${TAILSCALE_IP}"
  exec npx expo start --host lan --clear
else
  echo "Tailscale not detected, running with default host."
  exec npx expo start --clear
fi
