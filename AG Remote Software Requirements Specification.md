# AG Remote: Software Requirements Specification

Version 0.2 | Author: Fahd | Date: 2026-11-08 | Status: Draft, ready for implementation

## 1. Introduction

### 1.1 Purpose

This document specifies AG Remote, a system that lets a developer monitor and control the Antigravity IDE agent from a phone. It is written for two readers: the owner, and the Antigravity agent that will build the system. Section 15 contains binding rules for that agent.

### 1.2 Scope

In scope: a bridge extension running inside Antigravity on the developer's PC, a mobile app, a free private network path between them, push notifications, and a web client served by the bridge. The bridge must run identically on Windows and Debian 13 (KDE), the two operating systems the owner dual-boots.

Out of scope: any paid or hosted cloud service, multi-user support, other IDEs, replacing the IDE UI, and anything that reads, stores or forwards Google OAuth tokens.

### 1.3 Definitions

| Term | Meaning |
| --- | --- |
| Bridge | The VS Code extension inside Antigravity that exposes an API |
| Session | One agent conversation in Antigravity |
| Run | One agent working period, from prompt to idle |
| Approval | A step the agent cannot continue without user consent (file edit, terminal command, tool permission) |
| SDK | The community package antigravity-sdk |
| CDP | Chrome DevTools Protocol, reachable when the IDE starts with --remote-debugging-port |
| Tailnet | The private Tailscale network linking the PC and phone |
| ntfy | Free push notification service (ntfy.sh) |

### 1.4 References

- antigravity-sdk: https://kanezal.github.io/antigravity-sdk
- antigravity-link-extension (prior art, read for CDP techniques): https://github.com/cafeTechne/antigravity-link-extension
- Tailscale, ntfy and Expo official documentation

## 2. Project Overview

### 2.1 Problem

Antigravity agents run long tasks and stop to ask for permission. The developer must stay at the PC to notice completion, approve actions and send follow-up prompts.

### 2.2 Solution

A bridge extension exposes the agent's state and controls over a secured local API. A phone app reaches it through Tailscale. When a run finishes or needs approval, the PC pushes a notification through ntfy. The user opens the app, reads the situation, and approves, rejects or prompts.

### 2.3 Goals

- G1: Know within seconds when the agent finishes or is blocked, from anywhere.
- G2: Approve or reject agent actions from the phone.
- G3: Send prompts and stop a run from the phone.
- G4: Read recent chat output on the phone.
- G5: Total running cost of zero.

* G6: Work the same whether the laptop is booted into Windows or Debian 13 (KDE).
* G7: Build the app in JavaScript with Expo, run in Expo Go.

### 2.4 Non-goals

- Controlling background conversations that Antigravity does not render (known platform limit).
- Running the agent on the phone or in the cloud.
- Sharing access with other people.

### 2.5 User

A single developer who owns the PC and the phone.

### 2.6 Success Criteria

1. A finished run triggers a phone notification in under 10 seconds on mobile data.
2. An approval can be completed from the phone in under 3 taps after opening the notification.
3. The system works with the PC on one network and the phone on another.
4. No component requires a paid account.
5. The full loop passes on both Windows and Debian 13 using the same VSIX.

## 3. Constraints, Assumptions, Dependencies

### 3.1 Constraints

- C1: Zero budget. Only free tiers and self-run software.
- C2: No official Antigravity remote-control API. The system depends on a community SDK and CDP, both of which can break on IDE updates.
- C3: Antigravity's Agent Manager renders only the active conversation, so only that conversation is controllable.
- C4: Compliance. The system must use only the IDE's own commands and UI. It must never touch authentication tokens (Google's terms forbid extracting or forwarding them).
- C5: The PC must stay on, awake, online and running Antigravity.

* C6: Dual boot. The laptop runs Windows or Debian 13 (KDE), one at a time. Every component must work on both. Each OS install is a separate Tailscale device with its own address, its own token and its own ntfy topic.
* C7: The mobile app is built and run in Expo Go with no custom native modules. Only libraries bundled with Expo Go are allowed.
* C8: Expo Go may not receive Expo remote push notifications on the SDK in use (Phase 0 verifies), so all notifications go through ntfy.
* C9: Expo Go loads the app from a Metro dev server on the laptop. Daily use must not depend on Metro, so the bridge also serves the same app as a web client.

### 3.2 Assumptions

- A1: Antigravity can be launched with --remote-debugging-port.
- A2: Tailscale runs on both PC and phone.
- A3: The user can install a VSIX into Antigravity.

* A4: Expo Go is installed on the phone, and during development the phone can reach the laptop's Metro server over Tailscale.

### 3.3 Dependencies

antigravity-sdk, Node.js 20+, Tailscale (free personal plan), ntfy.sh public server, Expo SDK with Expo Go on the phone (optional later: Android Studio or Gradle for a standalone APK).

## 4. System Architecture

```
Phone: Expo Go app (JavaScript), or the web client in a browser
   |  HTTPS + WebSocket over Tailscale
   v
Bridge extension (inside Antigravity, on Windows or Debian)
   |-- Adapter layer: SdkAdapter and CdpAdapter behind one interface
   |-- State machine: idle | generating | awaiting_approval | error
   |-- HTTP + WebSocket server (auth, validation, rate limit)
   |-- Static host for the web client (same code as the app)
   '-- Notifier: outbound POST to ntfy.sh

Phone also runs the ntfy app for background alerts
```

### 4.1 Adapter interface

All IDE interaction goes through one interface so the SDK and CDP implementations are swappable and the rest of the system can be tested with a fake.

```ts
interface AgentAdapter {
  getState(): Promise<AgentState>;
  getMessages(limit: number): Promise<ChatMessage[]>;
  sendPrompt(text: string): Promise<void>;
  approve(): Promise<void>;
  reject(): Promise<void>;
  stop(): Promise<void>;
  onEvent(handler: (e: AgentEvent) => void): { dispose(): void };
}

type RunStatus = 'idle' | 'generating' | 'awaiting_approval' | 'error';

type AgentEvent =
  | { type: 'status_changed'; sessionId: string; status: RunStatus; at: number }
  | { type: 'approval_requested'; requestId: string; kind: 'edit' | 'terminal' | 'tool'; summary: string; at: number }
  | { type: 'run_finished'; sessionId: string; at: number }
  | { type: 'message_appended'; sessionId: string; role: 'user' | 'agent'; text: string; at: number }
  | { type: 'bridge_error'; message: string; at: number };
```

Note: approvals act on the current pending step, so requestId is generated by the bridge and is only valid while that step is pending.

### 4.2 Data flow: finished run

1. Adapter detects generating to idle.
2. State machine emits run\_finished.
3. WebSocket broadcasts to connected clients.
4. Notifier posts to ntfy with a click action that deep-links into the app.

### 4.3 Dual-boot and cross-platform design

The laptop boots Windows or Debian 13 (KDE), never both at once. The same VSIX is installed in Antigravity on each OS.

- Each OS install joins Tailscale as its own device with its own address and name. Name them consistently, for example laptop-win and laptop-deb.
- Each install generates its own token and ntfy topic, so profiles never mix. Notifications include the hostname, so the phone shows which OS sent them.
- The app keeps one profile per OS and, on launch, probes each profile's /health to pick the one that is up.
- The bridge finds its Tailscale address with os.networkInterfaces, looking for an IPv4 address in 100.64.0.0/10. It does not shell out for this.
- Every path uses path.join and os.homedir. No hardcoded separators, drive letters or /home paths.
- Launch helpers come in two forms: a PowerShell script for Windows, and a shell script for Debian that also writes a KDE launcher override. Both locate the Antigravity executable and add the debug-port flag.
- The Windows firewall and any Debian firewall must allow the bridge port on the Tailscale interface only. The setup docs list the steps for both.
- Keep-awake settings differ: powercfg on Windows, KDE Power Management or systemd-inhibit on Debian. The setup docs cover both.
- Secret storage differs: Windows Credential Manager versus libsecret on Linux. On KDE a Secret Service provider (KWallet can provide one) must be running. Phase 0 verifies that SecretStorage works on Debian.

## 5. Technology Stack

| Layer | Choice | Reason |
| --- | --- | --- |
| Bridge | VS Code extension, TypeScript, Node 20 | Runs inside Antigravity, direct access to IDE commands |
| IDE control | antigravity-sdk (primary), CDP (fallback) | SDK gives structured events; CDP covers gaps |
| Server | express, ws | Small and well known |
| Validation | zod in a shared package, used in TypeScript by the bridge and in JavaScript by the app | One source of truth for message shapes |
| Cross-platform | Node path and os modules only; launch scripts in PowerShell and shell | One codebase for Windows and Debian |
| Network | Tailscale (Windows and Debian clients), tailscale serve for HTTPS | Free, private, no port forwarding |
| Backup network | Cloudflare Quick Tunnel | Free, public URL, token auth mandatory |
| Push | ntfy.sh plus the ntfy phone app | Free, and works while Expo Go is closed |
| Mobile app | Expo (managed), React Native, JavaScript, expo-router, expo-camera for QR, expo-secure-store, run in Expo Go | Matches the owner's choice; no native build needed |
| Web client | The same Expo code exported with react-native-web (expo export --platform web), served by the bridge at /app | Permanent client with no Metro and no store; also covers iPhone |
| Packaging | vsce for the VSIX, installed locally | No marketplace needed |
| Tests | vitest, a fake adapter, a mock bridge; CI matrix on Windows and Ubuntu runners | Phone work without the IDE; both OSes checked |
| Monorepo | pnpm workspaces | Shared package |

## 6. Functional Requirements

Priority: M = must, S = should, C = could.

| ID | Requirement | Pri |
| --- | --- | --- |
| FR-1 | The bridge shall start and stop from the command palette. | M |
| FR-2 | The bridge shall reject any request without a valid bearer token. | M |
| FR-3 | The bridge shall show a QR code containing the base URL and token for pairing. | M |
| FR-4 | The bridge shall report session list and current run status. | M |
| FR-5 | The bridge shall detect run completion and emit run\_finished. | M |
| FR-6 | The bridge shall detect pending approvals and emit approval\_requested with kind and summary. | M |
| FR-7 | The bridge shall send a push notification on run\_finished and approval\_requested. | M |
| FR-8 | The bridge shall approve or reject the pending step on request. | M |
| FR-9 | The bridge shall submit a prompt to the active conversation. | M |
| FR-10 | The bridge shall stop a running generation. | S |
| FR-11 | The bridge shall return the last N chat messages. | S |
| FR-12 | The bridge shall stream events to clients over WebSocket. | M |
| FR-13 | The app shall pair by scanning the QR code (expo-camera) or by entering URL and token. | M |
| FR-14 | The app shall show current status and pending approval with approve and reject buttons. | M |
| FR-15 | The app shall provide a prompt box and a stop button. | M |
| FR-16 | The app shall show recent chat messages and update live. | S |
| FR-17 | The app shall store the token in secure storage. | M |
| FR-18 | Tapping a notification shall open the web client at the relevant screen. | S |
| FR-19 | The bridge shall expose a health endpoint and a test-push endpoint. | S |
| FR-20 | The bridge shall show a clear degraded status when the IDE was not started with the debug port (CDP mode). | S |
| FR-21 | The app shall keep one bridge profile per OS install (for example laptop-win and laptop-deb), probe them on launch, and connect to the one that responds. | M |
| FR-22 | The app shall offer an optional quiet-hours setting for non-approval notifications. | C |
| FR-23 | The bridge shall serve the web client over HTTPS at /app. | M |
| FR-24 | The bridge shall bind to the Tailscale address found with os.networkInterfaces, identically on Windows and Debian, and refuse to start with a clear message if none exists. | M |
| FR-25 | The repository shall provide launch helpers (scripts/launch-antigravity.ps1 and scripts/launch-antigravity.sh) that start Antigravity with the debug port. | M |
| FR-26 | The bridge shall report host OS and hostname in /health so the app can label profiles. | S |
| FR-27 | If secret storage is unavailable, the bridge shall fall back to an owner-only token file and show a visible warning. | S |

## 7. Non-Functional Requirements

| ID | Requirement |
| --- | --- |
| NFR-1 | Performance: event to phone notification within 10 seconds; API response within 500 ms excluding agent work. |
| NFR-2 | Reliability: the app auto-reconnects the WebSocket with backoff; the bridge survives adapter errors without crashing the extension host. |
| NFR-3 | Resource use: the bridge idles under 2 percent CPU and 100 MB memory. |
| NFR-4 | Maintainability: IDE-specific code lives only in adapter files so an Antigravity update touches one place. |
| NFR-5 | Portability: the bridge and web client run identically on Windows and Debian 13 (KDE); OS-specific code is limited to the launch scripts and one network-interface helper. macOS is not a target. |
| NFR-6 | Usability: every primary action is reachable in 3 taps or fewer. |
| NFR-7 | Cost: no recurring or one-time paid service. |
| NFR-8 | Observability: structured logs in a VS Code output channel; no secrets logged. |
| NFR-9 | Cross-OS verification: CI runs unit and integration tests on Windows and Ubuntu runners, and each phase's manual checklist is run on real Windows and real Debian before the phase closes. |

## 8. Interface Specification

All endpoints require the header Authorization: Bearer TOKEN. Base path is /v1.

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| GET | /health | none | status, version, adapter mode, host OS, hostname |
| GET | /state | none | sessions, activeSessionId, status, pendingApproval |
| GET | /messages?limit=50 | none | list of ChatMessage |
| POST | /prompt | text | accepted flag |
| POST | /approve | requestId | ok flag |
| POST | /reject | requestId | ok flag |
| POST | /stop | none | ok flag |
| POST | /push/test | none | ok flag |

WebSocket at /v1/stream carries the AgentEvent union from section 4.1 as JSON text frames. The client authenticates with the token as a query parameter or first message.

Error shape: an object with code and message. Codes: UNAUTHORIZED, INVALID\_BODY, NO\_PENDING\_APPROVAL, STALE\_REQUEST, ADAPTER\_UNAVAILABLE, RATE\_LIMITED.

The bridge also serves the web client's static files at /app without a token (public assets only). Every /v1 call still requires the token.

## 9. Security Requirements

The bridge can approve terminal commands on the owner's machine, so it is effectively remote code execution for anyone holding the token.

- SEC-1: Bind the server to the Tailscale interface address only, never 0.0.0.0 by default.
- SEC-2: Token is at least 32 random bytes, generated at first start, regenerable from a command.
- SEC-3: Compare tokens in constant time. Rate limit failed auth attempts.
- SEC-4: Validate every request body with zod. Reject unknown fields.
- SEC-5: Approvals must include the current requestId. A stale or mismatched id is rejected with STALE\_REQUEST.
- SEC-6: Notifications must never contain secrets or full command text. Send a short summary only. The ntfy topic is a long random string and is treated as a secret.
- SEC-7: The code never reads, stores, logs or forwards OAuth tokens or IDE credentials.
- SEC-8: The app stores the token only in secure storage and offers a revoke and re-pair flow.
- SEC-9: Quick Tunnel mode requires an extra warning in the UI and a shorter token lifetime.
- SEC-10: Dependencies are pinned and kept minimal.

* SEC-11: If secret storage is unavailable, the fallback token file must be readable only by the owner (mode 600 on Debian, a user-only ACL on Windows), and the UI must show a warning.
* SEC-12: Each OS install has its own token and ntfy topic. They are never shared or copied between installs.

## 10. Development Phases

Each phase ends with a demo and a commit tagged phase-N. The agent must stop at the end of each phase and wait for the owner's approval (rule R-3).

### Phase 0: Discovery spike

Goal: replace assumptions with facts.

- Install antigravity-sdk in a scratch extension and run it inside Antigravity.
- Record which calls work on the installed IDE version: list sessions, detect generating state, accept and reject a step, send a prompt, stop generation.
- Launch with the debug port and test CDP for the same capabilities.
- Read the antigravity-link-extension source for how it detects generating state and finds the input box.
- Produce docs/capabilities.md: a table of capability, method, mechanism (SDK or CDP), verified yes or no, notes.

* Repeat every check on both Windows and Debian 13 (KDE), and add an OS column to capabilities.md.
* Verify the Expo Go limits on the chosen SDK: expo-camera QR scanning, expo-secure-store, WebSocket, and whether remote push is unavailable.
* Verify the phone can load the app from Metro over Tailscale on both OSes by setting the packager host to the laptop's Tailscale address.
* Verify the extension's SecretStorage works on Debian KDE, and record where the Antigravity executable lives on each OS.

Exit: capabilities table complete. Any FR marked unachievable is flagged to the owner.

### Phase 1: Skeleton and security

- Monorepo with packages/shared, packages/bridge, apps/mobile placeholder.
- Extension activates, registers Start, Stop and Show QR commands.
- Express server with auth middleware, zod validation, /health, rate limiting.
- Token generation and storage in extension SecretStorage.
- FakeAdapter that simulates runs and approvals.

* network.ts: find the Tailscale IPv4 address with os.networkInterfaces; refuse to start with a clear message if there is none.
* scripts/launch-antigravity.ps1 and scripts/launch-antigravity.sh, plus docs/setup-windows.md and docs/setup-debian.md.
* A .gitattributes forcing LF line endings, and a CI workflow running tests on Windows and Ubuntu runners.

Exit: curl with and without the token behaves correctly; unit tests pass.

### Phase 2: State detection and notifications (MVP milestone 1)

- Real adapter: status detection and run\_finished.
- State machine with debounce to avoid false idle blips.
- Notifier posting to ntfy; configuration for topic.
- WebSocket stream.
- Test by installing the ntfy phone app and subscribing to the topic.

Exit: finishing a real agent run produces a phone notification within 10 seconds.

### Phase 3: Approvals (MVP milestone 2)

- Detect pending approvals and classify kind.
- approval\_requested event and notification.
- /approve and /reject with requestId checks.

Exit: a terminal-command permission is approved from curl, then from the phone browser.

### Phase 4: Prompting and stop

- /prompt delivers text to the active conversation.
- /stop cancels generation.
- /messages returns recent messages.

Exit: a full loop works over curl: prompt, notified, approve, finished.

### Phase 5: Mobile app

- Expo app in JavaScript with expo-router, run in Expo Go. Screens: Home (status and approval card), Prompt, Chat, Bridges (profiles).
- Pairing: scan the QR code with expo-camera or enter URL and token. Profiles are stored with expo-secure-store.
- On launch, probe every saved profile and connect to the first that responds.
- WebSocket client with reconnect and backoff. It runs in the foreground only; background alerts come from the ntfy app.
- Use only libraries bundled with Expo Go. Reject any package that needs custom native code.
- Development connectivity: run Metro on the laptop's Tailscale address so the phone can load the app away from the home network. Document the command for Windows and Debian.
- Export the same code as a web client with expo export --platform web and serve it from the bridge at /app. Notification taps open this web client.
- Optional, last: a standalone APK from a local build for use without Metro.

Exit: the entire loop works from the phone on mobile data, in Expo Go and in the web client, against both the Windows and Debian bridges.

### Phase 6: Live chat and polish

- Streaming message view, markdown rendering, auto-scroll.
- Error and degraded-state banners.
- Quiet hours.

### Phase 7: Hardening and release

- Security review against section 9.
- Soak test: 8 hours with repeated runs.
- IDE update drill: update Antigravity and fix adapter breakage.
- README with setup for Tailscale, ntfy, debug-port launch alias, VSIX install.
- Package VSIX and APK.

* Run the full manual checklist on real Windows and real Debian 13 (KDE) and fix OS-specific faults.

## 11. Repository and Conventions

```
ag-remote/
  AGENTS.md
  docs/
    SRS.md
    capabilities.md
    decisions.md
    setup-windows.md
    setup-debian.md
  scripts/
    launch-antigravity.ps1
    launch-antigravity.sh
  packages/
    shared/        zod schemas (TypeScript)
    bridge/
      src/
        extension.ts
        server.ts
        auth.ts
        network.ts
        stateMachine.ts
        notifier.ts
        adapters/
          AgentAdapter.ts
          FakeAdapter.ts
          SdkAdapter.ts
          CdpAdapter.ts
  apps/
    mobile/        Expo app (JavaScript); web export served at /app
```

- TypeScript strict mode in the bridge and shared package. The mobile app is JavaScript, with messages validated at runtime by the shared zod schemas.
- Simple, readable code. Small functions. No code comments; express intent through names and types.
- Conventional commits, one logical change per commit.
- Decisions and surprises go in docs/decisions.md, not in code comments.

## 12. Testing Strategy

- Unit: state machine transitions, auth middleware, schema validation, notifier payloads.
- Integration: bridge with FakeAdapter, exercised through HTTP and WebSocket.
- Contract: shared zod schemas used by both bridge tests and app tests.
- Manual on real IDE: scripted checklist per phase in docs/manual-tests.md.
- Security: attempts with missing, wrong and replayed tokens; stale requestId; oversized bodies.

* Cross-OS: unit and integration tests run in CI on Windows and Ubuntu runners; the manual checklist runs on real Windows and real Debian 13 before each phase closes.
* Expo Go: smoke test the app on a physical phone in Expo Go each phase, and test the web export in a mobile browser.

## 13. Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Antigravity update breaks SDK or CDP selectors | High | Adapter isolation, capability checks at startup, update drill in Phase 7 |
| SDK cannot send prompts or detect approvals | High | Phase 0 verifies; CDP fallback |
| False idle or generating detection | Medium | Debounce and cooldown in the state machine |
| Token leak enables remote command approval | Critical | Section 9 controls, Tailscale-only binding |
| ntfy topic guessed | Medium | Long random topic, no sensitive content in pushes |
| PC sleeps or goes offline | Medium | Power settings, optional Wake-on-LAN, app shows last-seen time |
| Terms of service issues | High | Never touch tokens; only IDE commands and UI |
| Only active conversation controllable | Medium | Documented limitation in app and README |
| Expo Go cannot run a needed library | Medium | Use only Expo Go-bundled libraries; move to a local standalone build only if unavoidable |
| App depends on Metro running on the laptop | Medium | Web client served by the bridge for daily use; Expo Go for development |
| Two OS installs confuse the app or notifications | Medium | Per-OS profiles, hostname in notifications, probe on launch |
| No Secret Service on Debian KDE | Medium | Phase 0 check; owner-only file fallback with a warning |
| Firewall blocks the bridge port | Low | Per-OS setup docs and a /health self-test |

## 14. Open Questions

1. Is the phone Android or iPhone? (Expo Go and the web client work on both; it only affects ntfy setup.)
2. Does the installed Antigravity version match what antigravity-sdk supports, on both Windows and Debian? (Phase 0 answers this.)
3. Can Antigravity start with the debug port on Debian 13 the same way as on Windows? (Phase 0 answers this.)
4. Should notifications for non-blocking completions be on by default? (Default: yes, with quiet hours later.)

## 15. Rules for the Antigravity Agent

These rules are binding. Copy them into AGENTS.md at the repository root.

### Workflow

- R-1: Read this SRS fully before writing code. Treat it as the source of truth. If something is unclear or contradictory, ask the owner instead of guessing.
- R-2: Work one phase at a time, in order. Do not start work belonging to a later phase.
- R-3: At the end of each phase, stop. Report what was done, what was tested, what failed, and what is next. Wait for explicit approval before continuing.
- R-4: Before starting a phase, write a short plan listing the files you will create or change. Keep changes within that plan.
- R-5: Commit in small steps with conventional commit messages. Never rewrite history. Never force push.

### Verification and honesty

- R-6: Never invent an API. Before using any function from antigravity-sdk, vscode, ws, express, zod or Expo, read its actual type definitions or documentation in node\_modules or the official docs and confirm the name and signature exist.
- R-7: Phase 0 findings override assumptions in this document. If a capability is not verified, mark it as unverified in docs/capabilities.md and tell the owner.
- R-8: Do not claim something works unless you ran it. State exactly how you verified it.
- R-9: If a test fails, fix the cause. Do not weaken or delete the test to make it pass.
- R-10: If blocked after two attempts, stop and report the problem with the error output instead of trying risky workarounds.

### Code quality

- R-11: Write simple code. Prefer plain functions and clear names. Avoid clever abstractions.
- R-12: Do not add code comments. Make the code self-explanatory. Record rationale in docs/decisions.md.
- R-13: TypeScript strict mode and no any in the bridge and shared package. The Expo app is JavaScript. Validate all external input with zod in both.
- R-14: IDE-specific logic lives only in files under adapters. Everything else depends on the AgentAdapter interface.
- R-15: Add a test with every feature that has logic. Run lint, typecheck and tests before declaring a phase done.

* R-27: Write cross-platform code. Use path and os for paths and system information. Keep OS-specific logic in scripts/ and packages/bridge/src/network.ts only. Every shell script needs a PowerShell twin, and each phase's manual checklist is run on both Windows and Debian.

### Dependencies

- R-16: Ask before adding any dependency not listed in section 5. Prefer the standard library and existing dependencies.
- R-17: Pin exact versions. Do not use packages that require payment, an account, or a hosted service.

* R-26: The mobile app runs in Expo Go. Use only libraries bundled with Expo Go. Do not add custom native modules, and do not run prebuild or eject. Check Expo Go compatibility of every package before using it.

### Security and compliance (non-negotiable)

- R-18: Never read, copy, log, store, transmit or reference Antigravity, Google or any OAuth tokens, cookies or credentials. Do not inspect credential files or databases for them.
- R-19: Never commit secrets. Keep tokens, topics and keys out of the repository, logs, error messages and notifications. Use SecretStorage and environment files that are gitignored.
- R-20: Never bind the server to a public interface by default. Never disable authentication, even temporarily or for testing.
- R-21: Do not weaken any requirement in section 9 for convenience. If one blocks progress, ask the owner.
- R-22: Do not run destructive commands (deleting outside the repository, force pushes, system configuration changes, installing system services) without explicit approval.
- R-23: Do not modify Antigravity installation files. The bridge works only through supported extension APIs, the SDK, and the debug port.

### Communication

- R-24: Keep reports short and factual. Use the format: Done, Verified, Problems, Next.
- R-25: Record every deviation from this SRS, with the reason, in docs/decisions.md and tell the owner.

### Definition of done for any task

Code compiles, typecheck and lint pass, tests pass, behavior was demonstrated, docs/capabilities.md or docs/decisions.md updated if anything surprising was found, and the change is committed.

## 16. Agent Kickoff Prompt

Paste this into Antigravity to begin.

> You are building AG Remote. Read docs/SRS.md completely, then create AGENTS.md from section 15 of the SRS. Follow those rules strictly. Target both Windows and Debian 13 (KDE); the mobile app is JavaScript run in Expo Go. Start with Phase 0 only. Produce docs/capabilities.md by testing the real IDE, never inventing API names. When Phase 0 is done, stop and report using the Done, Verified, Problems, Next format. Do not begin Phase 1 until I approve.
