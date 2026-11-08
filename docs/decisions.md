# Architecture and Implementation Decisions

Record of decisions, discoveries, and rationale for AG Remote.

## 2026-11-09: Repository initialization and environment setup
- Confirmed host OS is Debian 13 (trixie) x86_64, running Antigravity binary at `/opt/antigravity-ide/antigravity-ide`.
- Confirmed pnpm 12.18.0 and Node.js v24.16.0 available.
- Confirmed Tailscale active with `tailscale0` interface at `100.69.62.84`.
- Mobile platform confirmed as Android running Expo Go and ntfy app.

## 2026-11-09: Phase 0 Discovery Spike Findings
- **LS ConnectRPC Verification:**
  - The language server process runs with `--hub-port=44045` and `--csrf_token=<token>`.
  - ConnectRPC calls to `exa.language_server_pb.LanguageServerService` require header `x-codeium-csrf-token: <csrf_token>` (NOT `x-csrf-token`).
  - Successfully called `GetUserStatus` and `GetAllCascadeTrajectories` over HTTP returning status 200.
  - `GetAllCascadeTrajectories` yields conversation UUID, title, `stepCount`, and live status (`CASCADE_RUN_STATUS_RUNNING`), giving us direct, structured status monitoring.
- **Commands & Approval Verification:**
  - Antigravity registers commands `antigravity.agent.acceptAgentStep`, `antigravity.command.accept`, and `antigravity.terminalCommand.accept` (and corresponding reject commands).
- **CDP Fallbacks:**
  - Prior art analysis (`antigravity-link-extension`) confirmed cancel button selector `[data-tooltip-id="input-send-button-cancel-tooltip"]` whose visibility indicates active generation.
  - Composer input selector is `[data-lexical-editor="true"][contenteditable="true"]`.
- **Secret Storage:**
  - Verified `gnome-keyring-daemon` is running and servicing `org.freedesktop.secrets` on Debian 13 KDE, ensuring `vscode.ExtensionContext.secrets` will operate without fallback on this system.
- **Expo Go Capabilities:**
  - Verified `expo-camera`, `expo-secure-store`, and `WebSocket` are supported in Expo Go.
  - Confirmed native remote push via `expo-notifications` is restricted in Expo Go, validating the SRS architectural choice to use `ntfy.sh` via the standalone ntfy Android app.
- **Network & Binding:**
  - Verified programmatic detection and binding to Tailscale IP (`100.69.62.84`) within `100.64.0.0/10` using `os.networkInterfaces()`.
  - Verified outbound notification POST delivery to `ntfy.sh`.

## 2026-11-09: Phase 2 State Detection and Notifications (MVP Milestone 1)
- **State Machine Debounce:**
  - Implemented 2000ms debounce on `generating` to `idle` transitions in `AgentStateMachine`. Prevents transient idle states while the model is executing tool steps.
  - Implemented immediate transition to `idle` upon explicit user stop (`onStopped`), bypassing debounce delay.
- **Push Notifications via ntfy.sh:**
  - `NtfyNotifier` client sends outbound POST requests to `https://ntfy.sh/<topic>`.
  - Topics are generated with a 16-byte random hex string (`agremote_<hex>`) and stored securely.
  - Titles are prefixed with `[<hostname>]` to distinguish between Windows and Debian installations.
  - Quiet hours logic suppresses non-urgent `run_finished` alerts while preserving high-priority `approval_requested` alerts.
- **WebSocket Streaming:**
  - Configured `/v1/stream` WebSocket endpoint in `BridgeServer`.
  - Requires bearer token authentication either via query parameter (`?token=...`) or first frame.
  - Broadcasts all state machine `AgentEvent` objects (`status_changed`, `run_finished`, `approval_requested`, `bridge_error`) as JSON text frames in real time.
