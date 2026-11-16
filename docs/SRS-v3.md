# AG Remote — Ultimate Software Requirements Specification

**Version:** 3.0 — The Definitive Edition  
**Author:** Fahd  
**Date:** 2026-11-16  
**Status:** Draft — Ready for Implementation  
**Successor to:** v0.2 SRS (Nov 2026) + competitive analysis of DrOpenSource AG-Remote-main v0.3.4

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Project Overview](#2-project-overview)
3. [Constraints, Assumptions, Dependencies](#3-constraints-assumptions-dependencies)
4. [Architecture](#4-architecture)
5. [Component Specifications](#5-component-specifications)
6. [Functional Requirements](#6-functional-requirements)
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [Security Requirements](#8-security-requirements)
9. [API Specification](#9-api-specification)
10. [Mobile App Screens](#10-mobile-app-screens)
11. [Phased Implementation Roadmap](#11-phased-implementation-roadmap)
12. [Definition of Done](#12-definition-of-done)
13. [Agent Rules (Binding)](#13-agent-rules-binding)

---

## 1. Introduction

### 1.1 Purpose

This document specifies AG Remote v3 — the final, all-encompassing version of the AG Remote system. It supersedes all previous SRS versions and the AGENT.md from both this project and the DrOpenSource AG-Remote-main reference project. It is the single source of truth for the developer (owner) and for every Antigravity agent that builds the system.

### 1.2 Scope

AG Remote is a zero-cost, zero-cloud-dependency phone companion for the Antigravity IDE. It transforms the developer's Android phone into a full-power remote control plane:

- Monitor every live Antigravity conversation across all open IDE windows.
- Approve, deny, or answer every type of agent permission request with correct fidelity.
- Send prompts, attach images and files, and use voice input.
- Create new sessions, switch models, switch between conversations.
- Stop, restart, and steer running agents.
- Receive instant push notifications when attention is needed — with no third-party push service required.
- Browse the PC's file system and open any folder in Antigravity.
- Execute terminal commands on the PC through a sandboxed shell.
- All of this works over any network — the same local Wi-Fi, different networks, cellular data — with no Tailscale requirement and no port forwarding, via an end-to-end encrypted relay.

### 1.3 Definitions

| Term | Meaning |
|---|---|
| Bridge | The VS Code extension running inside Antigravity that exposes the control API |
| Session / Conversation | One agent conversation (cascade) in Antigravity, identified by `cascadeId` |
| Run | One agent working period from prompt to idle |
| Approval | A step the agent cannot continue without user consent |
| LS Bridge | The internal module that talks to the agy language server over ConnectRPC |
| Hub / Host Window | The IDE window whose extension process owns the shared server and relay connection |
| Worker Window | Any other IDE window that registers with the Hub via IPC |
| Relay | The hosted WebSocket intermediary at `remote.taqnik.in` (Cloudflare Worker + DO) |
| E2E | End-to-end encryption: ECDH P-256 key exchange + AES-256-GCM symmetric encryption |
| PWA | Progressive Web App — the browser-based fallback phone client |
| ntfy | ntfy.sh free push notification service (fallback for Expo Go native push) |
| Web Push | RFC 8291/8292 native browser push; sent directly from the PC to the phone's push service |
| Tailnet | Tailscale private network (supported but not required) |
| CDP | Chrome DevTools Protocol, available when IDE starts with `--remote-debugging-port` |
| SDK | The community `antigravity-sdk` package |

### 1.4 References

- Phase 0 findings: `docs/capabilities.md` (verified on Debian 13 KDE)
- Architecture decisions: `docs/decisions.md`
- Reference project: DrOpenSource AG-Remote-main v0.3.4
- antigravity-sdk: https://kanezal.github.io/antigravity-sdk
- Cloudflare Durable Objects: https://developers.cloudflare.com/durable-objects/
- RFC 8291 (Web Push): https://www.rfc-editor.org/rfc/rfc8291
- RFC 8292 (VAPID): https://www.rfc-editor.org/rfc/rfc8292

---

## 2. Project Overview

### 2.1 Problem

Antigravity agents run long autonomous tasks (10–60 minutes) and block multiple times on security gates requiring a human decision. The developer is not always at the keyboard. Every missed gate costs minutes of lost agent time. Additionally, starting a new agent task from the desk requires being physically present.

### 2.2 Solution

A bridge extension embedded in Antigravity exposes the full agent state and all controls through a local server and an outbound relay connection. A native phone app reaches either directly (Wi-Fi / Tailscale) or through the relay (any network). The phone is a fully capable terminal for the development environment.

### 2.3 Goals

| ID | Goal |
|---|---|
| G-1 | Know within 5 seconds when the agent finishes or is blocked, from anywhere on earth. |
| G-2 | Approve or reject agent actions with the same fidelity as clicking in the IDE. |
| G-3 | Send prompts, attach images, files, and use voice — from the phone. |
| G-4 | Read complete chat history of any conversation. |
| G-5 | Create new sessions, switch models, switch between conversations — remotely. |
| G-6 | Browse the PC's file system and open any folder in Antigravity. |
| G-7 | Run sandboxed terminal commands on the PC from the phone. |
| G-8 | Total running cost of zero. Free tier services only. |
| G-9 | Works on any network without Tailscale or port forwarding. |
| G-10 | Works identically on Windows 11 and Debian 13 (KDE). |
| G-11 | Works in Expo Go on Android, with no custom native modules. |
| G-12 | No relay server can read conversation content or tokens (E2E encrypted). |

### 2.4 Non-Goals

- Multi-user / team collaboration.
- Modifying Antigravity installation files.
- Running the agent on the phone or cloud.
- Paid services of any kind.
- macOS support (kept portable, never tested).
- Full code editor in the phone (the file browser is read/open only, not an editor).

### 2.5 Success Criteria

1. A finished run triggers a push notification in under 5 seconds on mobile data.
2. An approval is completable in under 3 taps from notification to confirmed.
3. A new conversation can be started from the phone within 5 seconds.
4. Terminal output begins streaming within 500 ms of sending a command.
5. Folder browsing shows PC directory contents within 1 second.
6. E2E test demonstrates that the relay server cannot decrypt any message.
7. Full flow passes on both Windows 11 and Debian 13 using the same VSIX and APK.
8. New user onboarding: scan one QR code, done. Under 60 seconds.

---

## 3. Constraints, Assumptions, Dependencies

### 3.1 Constraints

| ID | Constraint |
|---|---|
| C-1 | Zero budget. Only free tiers and self-run software. |
| C-2 | No official Antigravity remote-control API. The system uses ConnectRPC, VS Code commands, and transcript reading. |
| C-3 | Approvals for non-active conversations require `focusSession` before the approval command fires. |
| C-4 | The system must never read, forward, or log OAuth or Google tokens. |
| C-5 | The laptop must be on, awake, and running Antigravity. |
| C-6 | Dual boot: Windows 11 and Debian 13 (KDE). Same VSIX must work on both. |
| C-7 | Mobile app must run in Expo Go with no custom native modules. |
| C-8 | Expo Go cannot receive native remote push notifications; push goes through ntfy or Web Push (PWA). |
| C-9 | Terminal access is sandboxed. The phone cannot execute arbitrary privileged commands without allowlist approval. |
| C-10 | The relay (Cloudflare Worker + Durable Object) must remain on the free tier. Max 100K requests/day, 1 GB storage. |

### 3.2 Verified Capabilities (from Phase 0)

All the following were verified live on Debian 13 KDE. Windows verification is pending but architecturally equivalent.

- **ConnectRPC LS Bridge**: `GetAllCascadeTrajectories`, `GetCascadeTrajectory`, `SendUserCascadeMessage`, `StartCascade`, `HandleCascadeUserInteraction`, `CancelCascade` — all functional.
- **CSRF Token**: Read from the `agy` process command line (`/proc/<pid>/cmdline`). Never persisted.
- **VS Code Commands**: `antigravity.agent.acceptAgentStep`, `antigravity.agent.rejectAgentStep`, `antigravity.command.accept`, `antigravity.command.reject`, `antigravity.terminalCommand.accept`, `antigravity.terminalCommand.reject`, `antigravity.setVisibleConversation` — all verified registered.
- **Secret Storage**: `vscode.ExtensionContext.secrets` → `gnome-keyring` on Debian, Windows Credential Manager on Windows.
- **Tailscale IP Detection**: Programmatic via `os.networkInterfaces()`, prefix `100.`.
- **Network Binding**: `0.0.0.0` binding accessible from phone on same Wi-Fi.
- **ntfy Push**: Outbound POST to `ntfy.sh` delivers on Android.

### 3.3 Key Findings from DrOpenSource Reference (AG-Remote-main v0.3.4)

- **Camera pre-fetch bug**: iOS and Android camera apps send a background prefetch GET before the browser opens. For single-use tokens, the token is consumed before the user sees the page. Fix: respond to `Accept: text/html` requests with a 302 redirect that does not consume the token; only `Accept: application/json` exchanges it.
- **Hyper-V / Docker interface pollution**: `os.networkInterfaces()` often returns `172.17.x.x` (Docker) or `172.28.x.x` (Hyper-V) first. Physical interface priority: `192.168.x.x` > `10.x.x.x` > `100.x.x.x` (Tailscale) > everything else.
- **agy vs language_server**: New IDE builds (Oct 2026+) run one `agy` process per window, each attached to its own extension host via `--parent_pipe_path`. Older builds run a shared `language_server`. The discovery must handle both.
- **Multi-server ranking**: folder match → parent PID match → conversation list probe → reachable fallback.

---

## 4. Architecture

### 4.1 System Topology

```
┌─────────────────────────────────────────────────────────────────────┐
│                      PC (Developer's Laptop)                        │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │               Antigravity IDE (VS Code fork)               │    │
│  │                                                            │    │
│  │  ┌──────────────────────────────────────────────────────┐  │    │
│  │  │             AG Remote Bridge Extension               │  │    │
│  │  │                                                      │  │    │
│  │  │  ┌──────────┐  ┌──────────┐  ┌────────┐  ┌───────┐  │  │    │
│  │  │  │LS Bridge │  │Multi-Win │  │ Term   │  │  FS   │  │  │    │
│  │  │  │(ConnRPC) │  │Hub / IPC │  │Module  │  │Browser│  │  │    │
│  │  │  └────┬─────┘  └────┬─────┘  └───┬────┘  └───┬───┘  │  │    │
│  │  │       └─────────────┴────────────┴────────────┘      │  │    │
│  │  │                        │                             │  │    │
│  │  │          ┌─────────────▼──────────────┐              │  │    │
│  │  │          │  Session Manager + FSM     │              │  │    │
│  │  │          └──────────┬─────────────────┘              │  │    │
│  │  │                     │                               │  │    │
│  │  │  ┌──────────────────▼──┐  ┌───────────────────────┐ │  │    │
│  │  │  │  Local HTTP/WS      │  │  Relay Host            │ │  │    │
│  │  │  │  :49222             │  │  → remote.taqnik.in    │ │  │    │
│  │  │  └─────────────────────┘  └───────────────────────┘ │  │    │
│  │  └──────────────────────────────────────────────────────┘  │    │
│  └────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
         │  (Local Wi-Fi / Tailscale)        │  (Relay, any network)
         ▼                                  ▼
  Direct :49222                   Cloudflare Relay
  plain-HTTP + bearer             remote.taqnik.in
                                  E2E encrypted
              \                   /
               ▼                 ▼
      ┌─────────────────────────────────────┐
      │          Phone — AG Remote App      │
      │                                     │
      │  Chat │ Approvals │ Sessions        │
      │  Terminal │ Files │ Settings        │
      └─────────────────────────────────────┘
```

### 4.2 Component Boundaries (Hard Rules)

| Component | Allowed | Forbidden |
|---|---|---|
| `adapter-antigravity/` | ConnectRPC, VS Code commands, transcript JSONL | Network-facing code |
| `core/session-manager` | Adapter interface, window registry, state machine | Network, IDE-specific code |
| `server/` | HTTP/WS transport, auth, rate-limiting | IDE-specific logic |
| `relay-host/` | Outbound relay WS, E2E encryption, Web Push | IDE-specific logic |
| `terminal/` | Node `child_process`, allowlist | Network (goes through `server/` layer) |
| `fs-browser/` | Node `fs`, path sanitizer | Network (goes through `server/` layer) |
| `pwa/` | Browser WebCrypto, relay-link.js | Server-only modules |
| `apps/mobile/` | REST API, WebSocket, ntfy | Direct IDE access |

---

## 5. Component Specifications

### 5.1 Bridge Extension (`src/extension/`)

**On activation (`onStartupFinished`):**
1. Attempt to bind port 49222. Success → Hub. `EADDRINUSE` → Worker.
2. If Hub: start local HTTP server, connect relay host, register this window, expose all VS Code commands.
3. If Worker: `POST /api/hub/register { windowId, workspacePath, workspaceName, pid }` to Hub. Send heartbeat every 4 seconds.
4. Display status bar item: relay status indicator + "Show QR" button.

**VS Code Commands:**

| Command | Description |
|---|---|
| `agRemote.showPairingQr` | Show pairing QR + 6-character code |
| `agRemote.revokePairings` | Revoke all phone pairings |
| `agRemote.managePhones` | List/revoke paired phones |
| `agRemote.restartServer` | Restart server + relay |
| `agRemote.copyDiagnostics` | Copy full diagnostics to clipboard |
| `agRemote.allowPhone` | Approve a pending phone pairing (shown in IDE notification) |

**Configuration (`agRemote.*`):**

| Key | Type | Default | Description |
|---|---|---|---|
| `agRemote.port` | number | 49222 | Local server port |
| `agRemote.host` | string | `0.0.0.0` | Server bind address |
| `agRemote.transport` | enum | `relay` | `relay` / `wifi` / `both` |
| `agRemote.relayUrl` | string | `https://remote.taqnik.in` | Relay endpoint |
| `agRemote.terminalEnabled` | boolean | `true` | Enable terminal module |
| `agRemote.terminalAllowlist` | string[] | `[]` | Allowed command names |
| `agRemote.fsBrowserEnabled` | boolean | `true` | Enable file browser |
| `agRemote.fsBrowserRoot` | string | `~` | File browser root path |
| `agRemote.quietHoursEnabled` | boolean | `false` | Quiet hours toggle |
| `agRemote.quietHoursStart` | number | 23 | Quiet hours start (0–23) |
| `agRemote.quietHoursEnd` | number | 7 | Quiet hours end (0–23) |
| `agRemote.ntfyServer` | string | `https://ntfy.sh` | ntfy server URL |

---

### 5.2 Language Server Bridge (`src/adapter-antigravity/ls-bridge.ts`)

The only module permitted to speak ConnectRPC to the agy language server.

**Discovery (`discoverLanguageServers`):**
- **Linux**: Scan `/proc/<pid>/cmdline` for `agy` or `language_server` process binaries.
- **Windows**: PowerShell `Get-CimInstance Win32_Process` to get `CommandLine` for matching processes.
- Parse: `--hub-port`, `--csrf_token`, `--workspace_id`, `--parent_pipe_path`, `--add-dir`, `--app_data_dir`.
- Classify: `kind = 'agy'` if no `--workspace_id` and has `--parent_pipe_path`; else `kind = 'language_server'`.

**Server Ranking (`chooseEndpoint`) — Priority (highest → lowest):**
1. `agy` server whose `--add-dir` matches this window's folder (normalized, case-insensitive).
2. `agy` server whose PPID matches this window's extension host PID.
3. `agy` server that lists this window's conversations (`GetAllCascadeTrajectories` probe).
4. Any reachable `agy` server (single-window setups, matched as `'only'`).
5. `language_server` (older shared server, stale state — last resort).

**ConnectRPC Methods Used:**

| Method | Purpose |
|---|---|
| `GetAllCascadeTrajectories` | List all conversations for a window/workspace |
| `GetCascadeTrajectory` | Get full step history for a conversation |
| `SendUserCascadeMessage` | Send a prompt to any conversation |
| `StartCascade` | Create a new conversation (`{ source: 1 }`) |
| `CancelCascade` | Stop a running agent |
| `HandleCascadeUserInteraction` | Respond to an approval gate |
| `GetUserStatus` | Fetch available models + quota info |

**CSRF Token Handling:**
- Read from process cmdline at discovery time. Stored in memory only. Never logged, persisted, or transmitted outside `127.0.0.1`.

**Approval Interaction Builder (`buildInteraction`):**

| Kind | Fields sent |
|---|---|
| `permission` | `allow`, `scope` (once=1 / conversation=2), optional `userDenyInstruction` |
| `runCommand` | `confirm`, `proposedCommandLine`, `submittedCommandLine` |
| `filePermission` | `allow`, `scope`, `absolutePathUri` |
| `openBrowserUrl` | `confirm` |
| `captureBrowserScreenshot` | `confirm` |
| `executeBrowserJavascript` | `confirm` |
| `mcp` | `confirm` |
| `readUrlContent` | `confirm` |
| `ask_question` | Selected option index / text |

**Session Watcher (`session-watcher.ts`):**
- Polls every 500ms. Reads transcript JSONL from `~/.gemini/antigravity/brain/<cascadeId>/.system_generated/logs/transcript.jsonl` and `~/.gemini/antigravity-ide/brain/` for older builds.
- In `liveMode` (LS bridge available): uses live RPC data for status; transcript for message history.
- 2000ms debounce on `generating → idle` transitions.

---

### 5.3 Multi-Window Hub (`src/core/window-registry.ts` + `session-manager.ts`)

**Hub / Worker Pattern:**
- Port bind success → Hub. `EADDRINUSE` → Worker.
- Worker: `POST /api/hub/register`, heartbeat `POST /api/hub/heartbeat` every 4 seconds.
- Hub prunes windows missing 2 consecutive heartbeats (8 seconds).

**SessionManager (Multi-Window):**
- One `IdeAdapter` channel per registered window.
- Each channel emits events tagged with its `windowId`.
- Phone selects a window → that window's channel is the default for single-window API requests.

---

### 5.4 Local HTTP/WS Server (`src/server/`)

Built entirely with Node built-in `http` and `ws` modules. No Express dependency.

**Authentication:**
- Session token: 32 random bytes in VS Code SecretStorage.
- Pairing token: single-use, 16 random bytes, 5-minute TTL.
- All comparisons: `crypto.timingSafeEqual`.
- Rate limit: 10 failed attempts per IP → 15-minute lockout.

**QR / Pairing Flow:**
1. Generate one-time `pairingCode`. Embed in relay URL: `https://remote.taqnik.in/p/<roomId>#<e2eSecret>`.
2. 6-character short code retrieved from relay `/code` endpoint (optional).
3. Camera pre-fetch fix: `GET /pair?t=<code>` with `Accept: text/html` → 302 redirect, token not consumed. Only `Accept: application/json` exchanges the token.

---

### 5.5 Relay Transport (`src/relay-host/`)

**E2E Encryption Protocol (`src/pwa/e2e.js`):**
- Single file runs unchanged in Node (extension) and browser (PWA) using WebCrypto API.
- **Pairing Phase:**
  1. PC generates ECDH P-256 keypair. Secret is in the QR's `#fragment` (never sent to relay).
  2. Phone derives shared secret, sends `{t:'pair', pub, name, mac}` where `mac = HMAC-SHA256(secret, transcript)`.
  3. PC verifies HMAC, asks owner to approve phone (shows name + 4-digit check code in IDE).
  4. PC sends `{t:'paired', pub, mac}`. Phone stores PC's public key.
- **Session Phase:** `{t:'hello'}` → `{t:'welcome'}` → all subsequent frames `{t:'enc', n, c}` — AES-256-GCM, counter `n` per direction.
- **Large Frame Splitting:** Messages > 40 KB split into 30 KB parts before sealing (relay 64 KB frame cap).

**Relay Rate Limiting (Cloudflare DO):** 60 connections/min per IP, 10 pairing code lookups/min per IP.

**Reconnection:** Exponential backoff 1s → 30s max. Ping every 30 seconds. 10-second connect timeout.

---

### 5.6 Push Notification Engine

**Dual-Stack:**

| Channel | When used |
|---|---|
| Web Push (RFC 8291/8292) | PWA installed with push subscription |
| ntfy | Expo Go / fallback |

**Web Push (from scratch, Node built-ins only):**
- PC generates VAPID key pair (`EC prime256v1`) on first start, stored in SecretStorage.
- `encryptPayload`: RFC 8291 `aes128gcm` — ECDH → HKDF-SHA256 → AES-128-GCM. Only the phone decrypts.
- `vapidAuthorization`: RFC 8292 ES256 JWT scoped to push service origin, 12-hour TTL.
- Validates endpoint against allowlist of known push host domains (FCM, APNs, Mozilla, Windows).
- Topic-based notification replacement: one notification per project per urgency class.
- Visibility awareness: phone sends `{k:'visible'}` when app is on-screen → PC skips Web Push.

**ntfy (Fallback):**
- Outbound POST to `https://ntfy.sh/<topic>`. Self-hosted server supported.
- Quiet hours: suppress `run_finished` only. `approval_requested` always sends.

**Notification Events:**

| Event | Priority | Title |
|---|---|---|
| `approval_requested` | 5 urgent | `[Host] ⚡ Approval: <project>` |
| `run_finished` | 3 default | `[Host] ✅ Done: <project>` |
| `run_error` | 4 high | `[Host] ❌ Error: <project>` |
| `terminal_output_ready` | 2 low | `[Host] Terminal done` |

---

### 5.7 Mobile App (`apps/mobile/`)

**Stack:** React Native, Expo Router, Expo Go compatible. JavaScript.

**Navigation:**
```
(tabs)/
  chat.js           — Main chat screen
  approvals.js      — Approval screen (tab badge when pending)
  sessions.js       — Session list / switcher
  terminal.js       — Terminal screen
  files.js          — File browser
  settings.js       — Settings & pairing

Modals:
  scanner.js        — QR code scanner
  model-picker.js   — Model selection sheet
  image-viewer.js   — Full-screen image viewer
  diff-viewer.js    — Unified diff for file edit approvals
```

**Connection Manager:**
- Primary: relay (E2E WebCrypto).
- Fallback: direct to `<LAN-IP>:49222` with bearer token.
- Reconnect on `AppState` change to `active`: immediate re-sync within 500ms.
- Offline queue: prompts and approvals queued locally while disconnected; sent on reconnect.

**Multi-Host:**
- Stores list of known PCs: `{ roomId, name, customName, lastSeen }` in SecureStore.
- Host selector in top bar: tap to switch between known PCs.

---

### 5.8 Terminal Access Module (`src/terminal/`)

**Security First.** Disabled by default. Enable in settings + configure allowlist.

**Execution:**
- `POST /api/terminal/exec { command, sessionId? }` → validated against allowlist.
- Spawned with `child_process.spawn` as an **argv array** (never through a shell).
- Working directory: current IDE workspace folder.
- Stripped `env`: `HOME`, `PATH`, `USER`, `LANG` only.
- Max output: 1 MB (truncated with warning). Max runtime: 30 seconds (process killed).
- Output streams via WebSocket as `{type:'terminal_output', sessionId, chunk, done}`.
- Kill: `POST /api/terminal/kill { sessionId }`.

**Allowlist Format:**
```json
["git", "npm", "pnpm", "node", "ls", "cat", "pwd", "echo", "which", "find", "grep"]
```
- Matches the command binary name only. Flags/args are passed through.
- Shell operators (`;`, `&&`, `||`, `|`, `>`, backticks, `$()`) in any argument → rejected with `TERMINAL_SHELL_INJECTION`.

**Phone UI:**
- Monospace output view, ANSI color support.
- Input bar with history navigation (↑/↓), last 20 commands in SecureStore.
- Kill button (red), clear button.
- Working directory indicator.
- `cd <path>` intercepted as local CWD state change, not a subprocess.
- "Inject into Prompt" button: copies last N lines of output into chat input.

---

### 5.9 File System Browser Module (`src/fs-browser/`)

**Read-only browsing + "Open in Antigravity" action only.**

**Endpoints:**
- `GET /api/fs/roots` — drive roots (Windows: `C:\`, `D:\`; Linux: `/`, `~`).
- `GET /api/fs/list?path=<encoded>` — directory listing.
- `GET /api/fs/read?path=<encoded>` — text file content (max 500 KB). Binary files: `{type:'binary', size}`.
- `POST /api/fs/open { path, newWindow? }` — `vscode.commands.executeCommand('vscode.openFolder', uri)`.

**Security:**
- All paths: `path.resolve` + check against `agRemote.fsBrowserRoot`.
- Symlinks not followed outside root.
- Binary files: size + type only, no content.

**Phone UI:**
- Breadcrumb navigation bar.
- File/folder list with icons, size, modification date.
- Tap folder → navigate. Tap text file → inline preview (read-only, monospace, syntax highlight by extension).
- Long-press folder → bottom sheet: "Open in Antigravity", "Copy Path", "Bookmark".
- Search bar filters current directory.
- Bookmarks pinned at top.

**"Open in Antigravity" Flow:**
1. Phone → `POST /api/fs/open { path }`.
2. Bridge → `vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(path), { forceNewWindow: false })`.
3. Bridge emits `window_opened` event to phone.
4. Phone shows toast: "Opened `<folder>` in Antigravity."

---

## 6. Functional Requirements

### 6.1 Agent Control

| ID | Requirement | Priority |
|---|---|---|
| F-1 | View live status of the active agent (`idle`, `generating`, `awaiting_approval`). | MUST |
| F-2 | View complete chat history for any conversation. | MUST |
| F-3 | Send a text prompt to the active conversation. | MUST |
| F-4 | Attach up to 4 images (JPEG, PNG, WebP, GIF; max 6 MB total) to a prompt. | MUST |
| F-5 | Attach up to 5 files (PDF, text, code, log; max 10 MB total; no executables) to a prompt. | MUST |
| F-6 | Use voice input (phone microphone) to dictate a prompt. | SHOULD |
| F-7 | Stop an active run with one tap. | MUST |
| F-8 | Create a new Antigravity conversation from the phone. | MUST |
| F-9 | Switch the active model from the phone, with quota and reset time visible. | MUST |
| F-10 | Switch between existing conversations from the phone. | MUST |
| F-11 | View all open IDE windows and switch the phone's active target window. | MUST |

### 6.2 Approvals

| ID | Requirement | Priority |
|---|---|---|
| F-12 | View all pending approval requests. | MUST |
| F-13 | Approve with "Allow Once". | MUST |
| F-14 | Approve with "Allow for this conversation". | MUST |
| F-15 | Deny with optional reason text. | MUST |
| F-16 | For `runCommand`: show full command line and CWD. | MUST |
| F-17 | For `filePermission`: show file path + unified diff when available. | MUST |
| F-18 | For `ask_question`: show question, options as tappable cards, write-in field, Skip. | MUST |
| F-19 | For MCP / browser tools: show tool name and confirm/deny. | MUST |
| F-20 | Approvals that can only be answered in the IDE show an "Answer in IDE" indicator. | MUST |
| F-21 | Auto-pilot mode: automatically approve all `permission` gates with "Allow Once" (explicit opt-in). | NICE |

### 6.3 Notifications

| ID | Requirement | Priority |
|---|---|---|
| F-22 | Push notification within 5 seconds when an approval is needed. | MUST |
| F-23 | Push notification within 5 seconds when a run finishes. | MUST |
| F-24 | Push notification when a run errors. | MUST |
| F-25 | Tapping a notification deep-links to the relevant screen. | MUST |
| F-26 | Quiet hours: suppress `run_finished` and `run_error` notifications during configured hours. | SHOULD |
| F-27 | Per-project notifications: simultaneous projects produce distinct notifications. | MUST |
| F-28 | "Finished" notification debounced: sent only after agent stays idle 3 seconds. | MUST |

### 6.4 Pairing & Multi-PC

| ID | Requirement | Priority |
|---|---|---|
| F-29 | Scan a QR code in the IDE to pair. | MUST |
| F-30 | Type a 6-character pairing code as QR alternative. | MUST |
| F-31 | Pending pairing shows a 4-digit check code on both phone and PC. | MUST |
| F-32 | Pairing code expires after 5 minutes; reused codes are rejected. | MUST |
| F-33 | Store multiple paired PCs on the phone; switch between them. | MUST |
| F-34 | Rename a known PC from the phone. | SHOULD |
| F-35 | Forget/unpair a PC. | MUST |
| F-36 | Revoke all pairings from the IDE. | MUST |

### 6.5 Terminal Access

| ID | Requirement | Priority |
|---|---|---|
| F-38 | Execute allowlisted commands from the phone's terminal screen. | MUST (if enabled) |
| F-39 | Stream command output in real time. | MUST |
| F-40 | Kill a running command. | MUST |
| F-41 | Maintain command history (last 20) across sessions. | SHOULD |
| F-42 | Commands restricted to an allowlist configured on the PC. | MUST |
| F-43 | Commands not on allowlist rejected with clear error. | MUST |
| F-44 | Inject terminal output into chat prompt input. | NICE |

### 6.6 File System Browser

| ID | Requirement | Priority |
|---|---|---|
| F-45 | Browse PC's file system from a configurable root. | MUST (if enabled) |
| F-46 | Navigate into folders, navigate back. | MUST |
| F-47 | Preview text files (code, log, config). | SHOULD |
| F-48 | Open a folder in Antigravity with one tap. | MUST |
| F-49 | Bookmark frequently used folders. | SHOULD |
| F-50 | Search within current directory. | SHOULD |
| F-51 | Copy file path to clipboard on the phone. | SHOULD |

### 6.7 Diagnostics & Reliability

| ID | Requirement | Priority |
|---|---|---|
| F-52 | "Copy Diagnostics" IDE command generates a report (no tokens, no message text). | MUST |
| F-53 | WebSocket reconnects within 500ms of phone screen unlock. | MUST |
| F-54 | State resync called on every reconnect. | MUST |
| F-55 | If IDE UI changes and an approval command fails: show "IDE changed — update extension". | MUST |
| F-56 | Health endpoint returns server version, adapter mode, relay status, OS info. | MUST |

---

## 7. Non-Functional Requirements

### 7.1 Performance

| ID | Requirement |
|---|---|
| P-1 | Agent status changes reflected on phone within 1 second. |
| P-2 | Approval cards appear on phone within 2 seconds. |
| P-3 | Terminal output chunk latency < 200ms. |
| P-4 | File browser listing < 1 second for directories with < 10,000 entries. |
| P-5 | App cold start to connected state < 3 seconds on same Wi-Fi. |
| P-6 | Screen-unlock to live state < 500ms. |
| P-7 | Extension adds < 50ms to Antigravity startup time. |
| P-8 | LS poll (every 500ms) uses < 1% CPU on average. |

### 7.2 Reliability

| ID | Requirement |
|---|---|
| R-1 | Relay reconnects automatically within 30 seconds of a disconnect. |
| R-2 | Session watcher survives IDE crash gracefully (status → `disconnected`). |
| R-3 | Worker window re-registers automatically on Hub restart. |
| R-4 | File uploads older than 7 days auto-purged from `.ag-remote/uploads/`. |
| R-5 | No blocking of the IDE event loop. All LS calls are async. |

### 7.3 Compatibility

| ID | Requirement |
|---|---|
| C-1 | Same VSIX on Windows 11 (x64) and Debian 13 (KDE, x64). |
| C-2 | Same Expo bundle on Android 10+ (Expo Go). |
| C-3 | PWA on Chrome for Android 90+ and Safari iOS 15+. |
| C-4 | Node.js >= 20 (requires `crypto.hkdfSync`). |

### 7.4 Maintainability

| ID | Requirement |
|---|---|
| M-1 | All Antigravity-specific selector/command strings in one config file. |
| M-2 | All network interface selection logic in `src/core/network.ts` only. |
| M-3 | Zero runtime npm dependencies in the extension bundle. |
| M-4 | Shared types package contains all Zod schemas and inferred types. |
| M-5 | Every module has a corresponding test file. |

---

## 8. Security Requirements

> These requirements are non-negotiable. No requirement may be weakened for convenience.

| ID | Requirement |
|---|---|
| S-1 | Never read, copy, log, store, transmit, or reference Antigravity, Google, or any OAuth tokens, cookies, or credentials. |
| S-2 | Session token: 32 cryptographically random bytes in VS Code SecretStorage only. |
| S-3 | All token comparisons use `crypto.timingSafeEqual`. |
| S-4 | Pairing tokens: single-use, 5-minute TTL. |
| S-5 | Rate limit: 10 failed auth attempts per IP → 15-minute lockout. |
| S-6 | Relay server cannot decrypt any message payload (E2E AES-256-GCM). |
| S-7 | Phone approval requests must reference exact pending approval `id`. Blind approvals rejected. |
| S-8 | Web Push: only send to `*.googleapis.com`, `*.push.apple.com`, `*.mozilla.com`, `*.notify.windows.com`. Validate endpoint before sending. |
| S-9 | Terminal: commands passed as `argv` arrays, never through a shell. Shell metacharacters in any argument → rejected. |
| S-10 | File browser: all paths resolved and validated against `agRemote.fsBrowserRoot`. Symlinks not followed outside root. |
| S-11 | File upload attachments: executable extensions (`.exe`, `.bat`, `.cmd`, `.dll`, `.msi`, `.com`, `.scr`, `.vbs`, `.cpl`, `.pif`, `.ps1`) rejected. |
| S-12 | Local server in `relay`-only mode: only accepts loopback connections. |
| S-13 | All audit actions (approve, deny, prompt, stop, terminal exec, file open) logged locally with timestamps. No network reporting. |
| S-14 | Phone pairing requires explicit owner approval (4-digit check code confirmation). |

---

## 9. API Specification

### 9.1 REST Endpoints

All `/api/` endpoints require `Authorization: Bearer <token>` or `?token=<token>`.

**Agent Control:**

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | `/api/state` | — | `SessionSnapshot + hostName` |
| `GET` | `/api/windows` | — | `{ windows[], selectedId, hostName }` |
| `POST` | `/api/windows/select` | `{ windowId }` | `{ status, window, snapshot }` |
| `GET` | `/api/sessions` | — | `SessionSummary[]` |
| `POST` | `/api/sessions/select` | `{ cascadeId, windowId? }` | `{ ok }` |
| `POST` | `/api/sessions/create` | `{ text?, modelId?, windowId? }` | `{ cascadeId }` |
| `POST` | `/api/prompt` | `{ text, images?, files?, windowId? }` | `{ ok }` |
| `POST` | `/api/stop` | `{ windowId? }` | `{ ok }` |
| `POST` | `/api/approve` | `{ id, option, windowId? }` | `{ ok }` |
| `POST` | `/api/deny` | `{ id, reason?, windowId? }` | `{ ok }` |
| `GET` | `/api/models` | — | `{ models[], activeModelId }` |
| `POST` | `/api/models/select` | `{ modelId, windowId? }` | `{ ok }` |
| `GET` | `/api/health` | — | `HealthResponse` |

**Hub IPC (loopback only):**

| Method | Path | Body |
|---|---|---|
| `POST` | `/api/hub/register` | `{ windowId, workspacePath, workspaceName, pid }` |
| `POST` | `/api/hub/heartbeat` | `{ windowId }` |
| `GET` | `/api/hub/diagnostics` | — |

**Terminal:**

| Method | Path | Body |
|---|---|---|
| `POST` | `/api/terminal/exec` | `{ command, sessionId?, windowId? }` |
| `POST` | `/api/terminal/kill` | `{ sessionId }` |
| `GET` | `/api/terminal/history` | — |

**File Browser:**

| Method | Path | Body |
|---|---|---|
| `GET` | `/api/fs/roots` | — |
| `GET` | `/api/fs/list?path=<encoded>` | — |
| `GET` | `/api/fs/read?path=<encoded>` | — |
| `POST` | `/api/fs/open` | `{ path, newWindow? }` |

**Pairing:**

| Method | Path | Body |
|---|---|---|
| `GET` | `/pair?t=<code>` | — |
| `GET` | `/pair/view` | — (loopback only) |
| `POST` | `/api/phones/approve` | `{ phoneId }` |
| `POST` | `/api/phones/deny` | `{ phoneId }` |
| `GET` | `/api/phones` | — |
| `POST` | `/api/phones/revoke` | `{ phoneId }` |
| `POST` | `/api/push/subscribe` | `{ subscription }` (Web Push) |

**Settings:**

| Method | Path | Body |
|---|---|---|
| `GET` | `/api/settings` | — |
| `POST` | `/api/settings/quiet-hours` | `{ enabled, startHour, endHour }` |
| `POST` | `/api/settings/ntfy-topic` | `{ topic }` |
| `POST` | `/api/settings/terminal-allowlist` | `{ commands[] }` |

### 9.2 WebSocket Events (`/ws` or via relay)

**Server → Phone:**

| Event type | Fields |
|---|---|
| `status_changed` | `status, windowId?` |
| `message_appended` | `message: ChatMessage, windowId?` |
| `approval_requested` | `approval: Approval, windowId?` |
| `approval_resolved` | `id, windowId?` |
| `run_finished` | `sessionId, sessionTitle, windowId?` |
| `run_error` | `sessionId, error, windowId?` |
| `windows_changed` | `windows: RegisteredWindow[]` |
| `session_changed` | `cascadeId, windowId?` |
| `terminal_output` | `sessionId, chunk, done` |
| `window_opened` | `path, windowId` |
| `bridge_error` | `error` |

**Phone → Server:**

| Event type | Fields |
|---|---|
| `ping` | — |
| `visible` | `peerId` (suppress push) |
| `hidden` | `peerId` (resume push) |

### 9.3 Shared Types (Zod Schemas)

```typescript
SessionStatus: 'idle' | 'generating' | 'awaiting_approval' | 'disconnected'
ApprovalOption: 'allow_once' | 'allow_conversation' | 'deny'
ApprovalKind: 'permission' | 'runCommand' | 'filePermission' |
              'openBrowserUrl' | 'captureBrowserScreenshot' |
              'executeBrowserJavascript' | 'mcp' | 'readUrlContent' | 'ask_question'

Approval: {
  id: string
  kind: ApprovalKind
  description: string
  detail?: string
  commandLine?: string    // runCommand
  cwd?: string            // runCommand
  absolutePathUri?: string // filePermission
  diff?: string           // unified diff for filePermission
  question?: string       // ask_question
  options?: string[]      // ask_question
  isMultiSelect?: boolean // ask_question
  actions: ApprovalOption[]
}

ChatMessage: { id, role: 'user'|'agent', text, ts, images?: string[] }
SessionSummary: { cascadeId, title, workspace, lastActivity, isCurrent, status }
RegisteredWindow: { windowId, workspacePath, workspaceName, pid, focusedAt }
ModelInfo: { id, label, isActive, quota?: { remainingFraction, resetTime } }
```

---

## 10. Mobile App Screens

### 10.1 Chat Screen
- **Top bar:** PC selector dropdown, window tab bar (one tab per IDE window), model selector badge, status indicator dot.
- **Message feed:** User messages (right, bubbles), agent messages (left, markdown rendered), timestamps, inline image thumbnails, animated "thinking" indicator while `generating`.
- **Approval banner:** Sticky card at feed top when approval pending — kind icon, description, "Review" button jumping to Approvals tab.
- **Bottom bar:** Attach button (image + file picker), voice input, expandable text input, Send button, Stop button (red, only when `generating`).
- **Optimistic messages:** Sent messages appear instantly with "pending" indicator.

### 10.2 Approvals Screen
- Full-screen card per pending approval.
- **Kind-specific layouts:**
  - `runCommand`: command line in monospace box + CWD line.
  - `filePermission`: file path + unified diff viewer (syntax highlighted).
  - `ask_question`: radio/checkbox cards + write-in field + Skip button.
  - MCP/browser: tool name + confirm/deny.
  - IDE-only: "Answer in IDE" indicator, no action buttons.
- **Action bar:** "Allow Once", "Allow for Conversation", "Deny" + deny note field.
- **Haptic feedback** on every action.
- **Tab badge:** red count badge when pending > 0.

### 10.3 Sessions Screen
- Conversations grouped by IDE window.
- Each row: title, workspace name, last activity, status badge.
- Tap → switches active session.
- "New Chat" FAB → model picker sheet → creates session.

### 10.4 Terminal Screen
- Monospace output view with ANSI color support.
- Working directory indicator at top.
- Command input at bottom with history navigation.
- Autocomplete from history.
- Kill button (active during command), clear button.
- "Inject into Prompt" button (last N lines → chat input).
- Disabled state shown when `agRemote.terminalEnabled = false`.

### 10.5 Files Screen
- Breadcrumb navigation bar.
- List with icons: folder, text, image, binary.
- File metadata: name, size, modification date.
- Tap text file → inline read-only preview (syntax highlighted by extension).
- Long-press folder → bottom sheet: "Open in Antigravity", "Copy Path", "Bookmark".
- Search bar filters current directory.
- Bookmarks pinned at top.
- Root selector: Home, drive roots, Bookmarks.

### 10.6 Settings Screen
- **Connection:** Current PC, relay status, transport mode.
- **Notifications:** ntfy topic, test notification button, quiet hours toggle + time pickers.
- **Terminal:** Enable toggle, allowlist editor (add/remove command names).
- **Files:** Enable toggle, root path editor.
- **Appearance:** Theme (System/Light/Dark), chat font size slider.
- **Paired PCs:** List with rename, forget, and connect actions.
- **Advanced:** Auto-pilot toggle (with confirmation dialog), debug log viewer.

---

## 11. Phased Implementation Roadmap

> Work one phase at a time. Stop after each phase, report, and wait for explicit approval.

| Phase | Title | Key Deliverable |
|---|---|---|
| 0 | Capability Audit | ✅ Complete — `docs/capabilities.md` |
| 1 | LS Bridge Hardening | Multi-server ranking, agy classification, camera pre-fetch fix, Windows discovery, all 8+ approval kinds, sentinel tests |
| 2 | Multi-Window Hub | Hub/Worker IPC, window registry, per-window channels, phone window tab bar |
| 3 | E2E Encrypted Relay | E2E crypto module, RelayHost, relay-link.js, 6-char code, phone approval flow |
| 4 | Web Push | RFC 8291/8292 from scratch, VAPID, PWA service worker, visibility awareness |
| 5 | Approval Fidelity | All kind-specific payloads, diff viewer, question cards, haptics |
| 6 | Terminal Access | Sandboxed spawn, allowlist enforcement, WS streaming, phone terminal screen |
| 7 | File Browser + Open | Path traversal sanitizer, /api/fs/* endpoints, phone files screen, Open in Antigravity |
| 8 | Diagnostics + Polish | Copy Diagnostics command, sentinel tests, Playwright E2E, offline queue, multi-PC UI |
| 9 | Packaging | esbuild bundle, EAS APK, README, VSIX publish to Open VSX + Marketplace |

---

## 12. Definition of Done

A phase is complete when **all** of the following are true:

1. Code compiles with zero TypeScript errors in strict mode.
2. ESLint passes with zero warnings.
3. All new and existing tests pass.
4. The specific behavior was demonstrated live (not in a mock).
5. Demonstrated on both Windows 11 and Debian 13 (or explicitly waived with owner approval).
6. `docs/capabilities.md` updated if any capability was verified or invalidated.
7. `docs/decisions.md` records any deviation from this SRS, with the reason.
8. All new logic has a corresponding test.
9. No secrets, tokens, or credentials in code, logs, commits, or error messages.
10. Change is committed with a conventional commit message.

---

## 13. Agent Rules (Binding)

Copy these into `AGENTS.md` at the repository root. These supersede all prior AGENTS.md and AGENT.md files.

### Workflow
- **R-1:** Read this SRS completely before writing any code.
- **R-2:** Work one phase at a time, in order. Do not begin work from a later phase.
- **R-3:** At the end of each phase, stop and report: **Done / Verified / Problems / Next**. Wait for explicit approval.
- **R-4:** Before starting a phase, write a short plan listing every file you will create or change.
- **R-5:** Commit in small steps with conventional commit messages. Never rewrite history. Never force-push.

### Verification and Honesty
- **R-6:** Never invent an API. Read actual type definitions or documentation before using any external function.
- **R-7:** `docs/capabilities.md` overrides SRS assumptions. If a capability is unverified, mark it and tell the owner.
- **R-8:** Do not claim something works unless you ran it. State exactly how you verified it.
- **R-9:** If a test fails, fix the cause. Never weaken or delete a test to make it pass.
- **R-10:** If blocked after two attempts, stop and report the error output.
- **R-30:** **No Auto-Checking / Self-Testing:** The agent must NEVER automatically run exploratory checks, self-tests, or test suites on code or features it has created unless explicitly instructed by the user. The primary goal is flawless implementation with zero mistakes. The user is responsible for testing.

### Code Quality
- **R-11:** Write simple code. Plain functions and clear names. Avoid clever abstractions.
- **R-12:** No code comments. Record rationale in `docs/decisions.md`.
- **R-13:** TypeScript strict mode in all extension and shared code. No `any`. Validate external input with Zod. Mobile app is JavaScript.
- **R-14:** IDE-specific logic only in `src/adapter-antigravity/`. Everything else depends on `IdeAdapter`.
- **R-15:** Add a test with every feature that has logic.
- **R-27:** Cross-platform code everywhere. `path` and `os` for paths. OS-specific logic only in `scripts/` and `src/server/network.ts`. Every shell script has a PowerShell twin.

### Dependencies
- **R-16:** Ask before adding any dependency not already in the project. Prefer Node built-ins.
- **R-17:** Pin exact versions. No paid services.
- **R-26:** Mobile app: Expo Go only. No custom native modules. No `prebuild` or `eject`.

### Security (Non-negotiable)
- **R-18:** Never read, copy, log, store, transmit, or reference any OAuth tokens, Google tokens, cookies, or credentials.
- **R-19:** Never commit secrets. Use SecretStorage and `.gitignore`d environment files.
- **R-20:** Never bind the server publicly in relay-only mode. Never disable authentication.
- **R-21:** Do not weaken any requirement in Section 8. If one blocks progress, ask the owner.
- **R-22:** Do not run destructive commands without explicit approval.
- **R-23:** Do not modify Antigravity installation files.
- **R-28:** Terminal: never use a shell string. Always `spawn` with an argv array. Reject shell metacharacters.
- **R-29:** File browser: always resolve and validate paths against `agRemote.fsBrowserRoot` before serving any content.

### Communication
- **R-24:** Keep reports short and factual. Format: **Done / Verified / Problems / Next**.
- **R-25:** Record every deviation from this SRS, with the reason, in `docs/decisions.md`.

