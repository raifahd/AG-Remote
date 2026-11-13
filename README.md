# AG Remote

Remote monitoring, approvals, and conversational control for **Google Antigravity IDE** from your phone over private **Tailscale** WireGuard mesh networking and **ntfy.sh** with zero cloud infrastructure and zero cost.

---

## Architecture Overview

```
Mobile Phone (Android Expo Go or Browser Web App)
       │
       │ HTTPS / WSS over Tailscale (100.64.0.0/10)
       ▼
Host PC (Debian 13 or Windows 11)
  ┌────────────────────────────────────────────────────────┐
  │ AG Remote Bridge (:48123)                              │
  │   ├── Express & WebSocket API (/v1/state, /v1/stream)  │
  │   ├── Web Client Server (/app)                         │
  │   ├── Token Auth & Sliding Window Rate Limiter         │
  │   ├── Ntfy Notifier (Outbound POST alerts)             │
  │   └── Adapters:                                        │
  │         └── SdkAdapter (ConnectRPC on port 44045)      │
  │              └── Antigravity IDE Agent Manager         │
  └────────────────────────────────────────────────────────┘
```

---

## Features

- **Real-Time Agent Monitoring**: Live tracking of agent state (`idle`, `generating`, `awaiting_approval`, `error`) with a 2000ms transition debounce to eliminate transient idle blips.
- **One-Tap Approvals**: Review and accept/reject pending terminal commands, tool executions, and file edits directly from your phone. Stale requests are protected by cryptographically random, single-use `requestId` tokens.
- **Remote Prompting & Instant Cancellation**: Send new prompts to your active Antigravity Cascade session or halt ongoing generation via the white circular stop button.
- **Live Chat with Markdown & Auto-Scroll**: Real-time conversational view featuring syntax-highlighted code blocks, bold/italics, bulleted lists, and intelligent viewport auto-scrolling.
- **Zero Cloud Costs**: Connects via Tailscale's WireGuard mesh (`100.64.0.0/10`) and delivers free background push notifications through public or self-hosted `ntfy.sh`.
- **Standalone Mobile App**: Native mobile app built on React Native & Expo with multi-profile support (Debian and Windows dual-boot setups), instant QR code pairing, and local encrypted hardware credential storage.
- **Non-Disturbing Quiet Hours**: Mutes non-urgent run-finished alerts during customizable hours (default: 23:00 to 07:00) while ensuring critical approval requests always wake your device.

---

## Setup & Quickstart

### 1. Prerequisites
- **Node.js** 20+ and **pnpm** 10+
- **Tailscale** installed on your PC and mobile phone (authenticated under the same free account)
- **ntfy** Android App (optional, for background notifications)

### 2. Tailscale Configuration
Verify your host has a Tailscale IPv4 address:
```bash
tailscale ip -4
# Example output: 100.x.y.z
```
Ensure Tailscale is connected on your mobile phone under the same Tailscale network.

### 3. Launching Antigravity IDE
To enable remote communication, Antigravity IDE should be started with the remote debugging port enabled:
- **Debian / Linux**:
  ```bash
  ./scripts/launch-antigravity.sh
  ```
- **Windows**:
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\scripts\launch-antigravity.ps1
  ```

### 4. Running the Bridge
Start the bridge service:
```bash
node scripts/start-bridge.js
```
The console will print your Tailscale URL, bearer token, and ntfy topic:
```
-----------------------------------------------------------------
AG Remote Bridge is RUNNING!
Bridge API:      http://<your-tailscale-ip>:48123
ntfy Topic:      agremote_<hex-topic>
-----------------------------------------------------------------
```
Or in the Antigravity IDE extension, click **"AG Remote"** in the status bar (or press `Ctrl+Shift+P` and run `AG Remote: Show Pairing QR`).

### 5. Connecting from Your Phone

1. Open the **AG Remote** app on your phone (standalone APK or via Expo Go).
2. Tap **Scan Bridge QR Code** (or open the **Scanner** tab).
3. Point your camera at the QR code displayed by Antigravity on your PC screen.
4. Your phone is immediately paired and ready to monitor runs, stream thoughts and tool executions, approve commands, and submit prompts.

---

## Security Model

AG Remote provides remote access to your machine's terminal commands and IDE composer, and is designed with strict security constraints:

- **Network Isolation**: The server strictly binds to the detected Tailscale IPv4 address (`100.64.0.0/10`) and refuses to bind to `0.0.0.0` or public internet interfaces.
- **Cryptographic Authentication**: Access requires a 64-character hex secret token evaluated using constant-time comparisons (`crypto.timingSafeEqual`) to prevent timing side-channel attacks.
- **Sliding-Window Rate Limiting**: Repeated failed authorization attempts trigger an immediate `429 RATE_LIMITED` block.
- **Strict Payload Validation**: All inbound requests are validated against Zod schemas in strict mode (`.strict()`), instantly rejecting any payloads with unknown properties.
- **Notification Privacy**: Notifications never include OAuth tokens, secret keys, or raw full command payloads. Ntfy topics are randomized secrets.
- **Storage Protection**: On Linux hosts without keyring daemons, fallback token files are locked to `0o600` (read/write by owner only).

---

## Project Structure

```
├── apps/
│   └── mobile/          # Expo Go / React Native mobile app (SDK 58)
├── packages/
│   ├── bridge/          # Express/WebSocket bridge & VS Code extension
│   └── shared/          # Shared Zod schemas, TypeScript types, and contracts
├── scripts/
│   ├── launch-antigravity.sh   # Linux launch wrapper with debug port
│   ├── launch-antigravity.ps1  # Windows launch wrapper with debug port
│   ├── start-bridge.js         # Bridge launcher daemon
│   ├── start-mobile.sh         # Mobile bundler launcher for Linux
│   └── start-mobile.ps1        # Mobile bundler launcher for Windows
└── docs/
    ├── SRS.md                  # Software Requirements Specification
    ├── capabilities.md         # Discovery spike and RPC capability findings
    ├── decisions.md            # Architectural and implementation decisions log
    ├── setup-debian.md         # Debian 13 KDE setup guide
    └── setup-windows.md        # Windows 11 setup guide
```

---

## Testing & Quality

Run all unit, integration, and security audit tests:
```bash
pnpm test
```
Run typechecking and linters across monorepo packages:
```bash
pnpm --filter @ag-remote/shared build
pnpm --filter @ag-remote/bridge build
pnpm --filter @ag-remote/mobile run typecheck
```

---

## License

Private / Personal Project. All rights reserved.

