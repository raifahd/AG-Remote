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

## 2026-11-09: Phase 3 Approvals (MVP Milestone 2)
- **Approval Classification & Lifecycle:**
  - `ApprovalManager` generates transient, cryptographically random `requestId`s (`req_<hex>`).
  - Strict validation rejects stale or nonexistent requests with `STALE_REQUEST` or `NO_PENDING_APPROVAL`.
  - Step classification differentiates `terminal` (terminal command execution), `edit` (agent code modifications), and `tool` (external tool invocations), dispatching the corresponding VS Code extension commands (`antigravity.terminalCommand.accept`, `antigravity.agent.acceptAgentStep`, `antigravity.command.accept`).
- **Web Approval Client at `/app`:**
  - Served unauthenticated static HTML/JS shell from the bridge at `/app` and `/app/*`.
  - Supports deep-link authentication via query token (`/app?token=...`) and persistent storage in `localStorage`.
  - Connects to `/v1/stream` WebSocket to render real-time approval cards and status updates, allowing 1-tap approvals from mobile browsers.

## 2026-11-09: Phase 4 Prompting and Stop
- **Trajectory & Chat Messages (`GetCascadeTrajectory`):**
  - Confirmed ConnectRPC endpoint `GetCascadeTrajectory` with payload `{ cascadeId }` returns full trajectory details including all executed cortex steps.
  - Extracted user prompts from steps with type `CORTEX_STEP_TYPE_USER_INPUT` (`userInput.userResponse`).
  - Extracted agent responses from steps with type `CORTEX_STEP_TYPE_PLANNER_RESPONSE` (`plannerResponse.response`).
  - Implemented `/v1/messages?limit=N` returning structured `ChatMessage` objects in reverse chronological order.
- **Web App Chat & Controls:**
  - Expanded web client at `/app` to include an interactive prompt textarea, Send button, Stop button, and live message history stream.

## 2026-11-09: Phase 5 Mobile Application (Expo Go & Web)
- **Monochrome Premium Black-and-White Theme:**
  - Implemented dual-theme architecture supporting both pure OLED dark mode (`#000000`, surface `#0c0c0e`, border `#27272a`, text `#ffffff`) and minimal paper light mode (`#ffffff`, surface `#f8fafc`, border `#e2e8f0`, text `#09090b`).
  - Added real-time theme toggle persisted across sessions.
- **Expo Go Compatibility & Architecture:**
  - App developed in Expo 52 SDK without prebuild, ejection, or custom native modules, running directly in Expo Go on Android.
  - Multi-tab navigation with Expo Router (`expo-router`):
    - `(tabs)/index.js`: Remote status screen with active bridge reachability, latency probe, pending approval action card, and stop generation control.
    - `(tabs)/chat.js`: Linear/iMessage-style conversational feed with distinct user and agent message bubbles, monospace pre-formatted code support, auto-scrolling, and floating prompt composer.
    - `(tabs)/bridges.js`: Multi-OS profile manager for Debian and Windows dual-boot setups, showing per-profile latency probes, active profile switcher, manual profile creator, test ping trigger, and theme toggle.
    - `scanner.js`: Modal QR scanner using `expo-camera` (`CameraView`) with fallback text JSON parser, validating with shared `PairingPayloadSchema`.
- **Packaging & Dependency Resolution in pnpm Monorepo:**
  - Configured `node-linker=hoisted` in root `.npmrc` to provide flat node_modules resolution required by React Native Metro.
  - Added `metro.config.js` watching monorepo root and prioritizing resolution across workspace dependencies.
- **Static Web Export & Bridge Integration:**
  - Static export built via `expo export --platform web`.
  - Upgraded standalone web client in `webApp.ts` with the exact same black-and-white minimalist design, ensuring immediate accessibility from any mobile or desktop web browser directly over Tailscale without requiring Metro.

## 2026-11-09: Expo SDK 58, Chrome Floating Bar, Typography & Realtime Agent Indicator
- **Expo SDK 58 & Dependency Resolution:**
  - Upgraded Expo from SDK 52 to SDK 58 (`expo@~58.0.23`, `react@19.3.0`, `react-native@0.88.1`, `expo-router@~58.0.30`).
  - Diagnosed `TypeError: Cannot read property 'EventEmitter' of undefined` using `npx expo-doctor`: resolved missing `expo-font` peer dependency required by icon packages and deprecated `splash` configuration in `app.json`.
  - Added lazy loading in `storage.js` to ensure native modules like `expo-secure-store` are never evaluated before Expo runtime initialization.
- **Chrome / Web App Layout & Typography:**
  - Enforced `overflow-x: hidden !important` across `html`, `body`, `#mainContent`, and `#messagesContainer` to eliminate horizontal scroll in mobile Chrome.
  - Implemented Poppins font across all views via Google Fonts and CSS rules.
  - Redesigned prompt input bar as a fixed floating pill centered with `left: 50%; transform: translateX(-50%)` and layered ambient box-shadow.
  - Added prominent white circular stop button with solid stop icon at the right end of the floating bar.
  - Designed vector SVG AG Remote logo badge in header, chat placeholder, and agent messages.
  - Implemented live in-chat working indicator bubble ("Antigravity is working...") with animated pulsing green indicator when agent state is `generating`.

## 2026-11-09: Phase 6 Live Chat, Degraded Banners & Quiet Hours
- **Degraded State & Error Banners (FR-20):**
  - Added `degradedReason` to `HealthResponseSchema` and `buildHealthResponse()`.
  - When token fallback mode is active or when the IDE is running without the debug port in CDP mode, `/health` reports `status: "degraded"` with a specific explanatory reason.
  - Rendered dismissible/persistent system banners (`#degradedBanner` and `#offlineBanner`) in both the web client (`webApp.ts`) and the Expo mobile app (`(tabs)/index.js` and `(tabs)/chat.js`).
- **Live Chat Auto-Scroll Polish (FR-16):**
  - Enhanced message containers in web and mobile to automatically track user scroll position: automatically smooth-scrolls to the latest message while keeping scroll position intact if the user actively scrolled up to view message history.
- **Quiet Hours Configuration (FR-22):**
  - Defined `QuietHoursSettingsSchema` in `@ag-remote/shared`.
  - Added `GET /v1/settings` and `POST /v1/settings` endpoints on the bridge to query and update quiet hours schedules on `NtfyNotifier`.
  - Integrated quiet hours settings into the web client Settings modal and the mobile app Bridges tab with persistent local storage and live bridge synchronization.




## 2026-11-09: Phase 7 Hardening & Security Audit
- **Security Audit (Section 9 Compliance):**
  - Added dedicated test suite `packages/bridge/test/securityAudit.test.ts` testing SEC-1 through SEC-12.
  - Verified network interface isolation to Tailscale cgNAT range (`100.64.0.0/10`), rejecting 0.0.0.0.
  - Verified 64-character random hex token enforcement and sliding-window rate limiting.
  - Verified strict Zod payload validation rejecting extraneous or injected fields on prompts and approvals.
  - Verified `STALE_REQUEST` and `NO_PENDING_APPROVAL` handling preventing forged or replayed actions.
  - Verified notification payload sanitization against credential leaks.
  - Verified owner-only file permissions (`0o600`) on fallback secret files on Unix hosts.
- **Release Documentation & Packaging:**
  - Authored comprehensive `README.md` covering architecture, Tailscale setup, launch scripts (`launch-antigravity.sh` and `launch-antigravity.ps1`), VSIX installation, and mobile pairing.
  - Added `vscode:prepublish` packaging scripts to `@ag-remote/bridge`.
  - Confirmed APK build generation deferred per explicit user request.

## 2026-11-09: Mobile App UI 1:1 Companion Synchronization
- **Exact Companion Design System Match:**
  - Synchronized color palette with companion prototype: surface `#0d0d0d`, raised `#161616`, border `#282828`, text `#ffffff`, muted `#8a8a8a`, subtle `#5b5b5b`, danger `#ff5d5d`, warning `#f1b83a`, success `#31c77a`.
  - Added 8 selectable accent colors (`#7C5CFF`, `#4385F5`, `#25C9DF`, `#28C77B`, `#A4D832`, `#F1B83A`, `#F47C3C`, `#ED5BA6`), defaulting to `#7C5CFF`.
  - Re-implemented all SVG iconography (21 custom icons) via `react-native-svg` matching companion vector paths 1:1.
  - Implemented standard floating bottom tab bar (`TabBar.js`) with 4 tabs: `Home`, `Chat`, `Workspaces`, and `Settings`.
  - Implemented top bar (`TopBar.js`) with wordmark (`AG Remote`) on Home and eyebrow status / titles on other screens.
  - Redesigned Home screen with status orb, animated pulse ring, blinking cursor indicator, interactive hold-to-approve card, quick prompt pill, and recent activity timeline.
  - Redesigned Chat screen with `AG` avatar bubbles, accent user bubbles, tool step cards, code snippet cards with language badges and copy actions, and floating composer.
  - Implemented Workspaces screen with bridge status badges, open workspace cards, dashed add button, and pairing modal.
  - Implemented Settings screen with theme toggle, accent color swatch selector, notification/quiet-hours toggles, security links, and floating toast notifications.

## 2026-11-10: Chat Latency Optimization, Keyboard Smoothness & Hub Discovery
- **Language Server Hub Port & CSRF Auto-Discovery:**
  - Identified dynamic `--hub-port` and `--csrf_token` assignment on Antigravity language server startup.
  - Implemented `detectAgyHub()` parsing `/proc/<pid>/cmdline` on Linux to extract dynamic hub port and CSRF token automatically.
  - Added automatic detection and single-retry fallback in `SdkAdapter.callRpc()`, making connections self-healing if Antigravity restarts.
  - Reduced RPC timeout from infinite to 5000ms with error propagation to prevent hanging calls.
- **Optimistic Chat Messaging:**
  - In `apps/mobile/app/(tabs)/chat.js`, appended user messages immediately to local `messages` state on submit with unique local timestamp IDs.
  - Cleared input text instantly and smoothly triggered scroll-to-bottom, delivering immediate UI responsiveness while ConnectRPC executes in background.
- **Android Soft-Input White Flash Elimination:**
  - Set `KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}` on Android to eliminate conflict with native Android `adjustResize` window resizing.
  - Enabled `UIManager.setLayoutAnimationEnabledExperimental` and applied `LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)` on keyboard show/hide events for smooth interpolation.
  - Set explicit background colors matching `theme.bg` across root view, `chatBody`, and `composerContainer`.
  - Hidden floating `TabBar` automatically while keyboard is visible to maximize screen space for messages and composer.

## 2026-11-10: Chat UI Polish, Dynamic Input Clearance & System Notifications
- **Send Arrow Icon & Dynamic Composer Positioning:**
  - Upgraded send button icon from paper-airplane glyph to `ArrowUp02Icon` (↑) from `@hugeicons/core-free-icons`, aligned with companion chat apps.
  - Dynamically calculated composer bottom margin using `useSafeAreaInsets()` (`Math.max(insets.bottom, 16) + 78` when closed, `Math.max(insets.bottom, 10)` when open). Guarantees a 16px floating clearance above the bottom navigation bar on all device aspect ratios.
- **Scroll Down Arrow Placement:**
  - Repositioned the scroll-to-bottom button inside `chatBody` to `bottom: 14`, placing it directly above the composer input bar rather than floating high in the message feed.
  - Added visibility guard rendering only when more than 2 messages exist.
- **Empty Chat & Workspace Session Starter:**
  - Implemented `ChatEmptyState` component for the chat tab when no messages exist.
  - Features an animated companion orb, active workspace card with live status indicator and host address, one-tap workspace switcher for all stored fleet profiles, and quick action starter prompt pills.
- **TopBar Notification Modal & Dispatch:**
  - Created `NotificationModal` accessible from the top-right bell icon across all screens via `TopBar`.
  - Added live push delivery connection status, target host, one-tap "Send Test Push Notification" trigger hitting `/v1/push/test` on the bridge, quiet hours toggle, and categorized alert descriptions.

## 2026-11-10: Pill Geometry, Dark Mode Glow & File Attachments
- **100% Border Radius (Capsule Geometry):**
  - Updated `TabBar` and `composer` input container to `borderRadius: 9999`, creating complete continuous pill geometry.
  - Set tab items and send/attach buttons to match the circular capsule style.
- **Dark Mode Box Shadow & Rim Illumination:**
  - Configured dark-mode-specific shadow and rim styles against OLED `#000000` backgrounds:
    - Translucent rim borders (`rgba(255, 255, 255, 0.12)`) providing edge definition.
    - Soft specular ambient glow using `shadowColor: '#ffffff'` with `shadowOpacity: 0.08` and `shadowRadius: 16`.
    - Android elevated surfaces (`elevation: 10-12`) ensuring physical depth over pure black.
- **Centered Placeholder Typography:**
  - Configured `TextInput` with `textAlignVertical: 'center'` and dynamic `textAlign: inputText ? 'left' : 'center'`.
  - When empty, "Message your agent" sits in the exact horizontal and vertical center of the input bar; when typing, text flows naturally from the left.
- **File & Document Attachments:**
  - Integrated `expo-document-picker@~58.0.4` (bundled in Expo Go SDK 58) for multi-file attachments (PDFs, images, code, text).
  - Added horizontal attachment chips above the input box with file names, sizes, and tap-to-remove actions.
  - Automatically formats attachment metadata into user messages and renders visual attachment badges in the chat feed.

## 2026-11-10: Removal of Box Shadow & VirtualizedList Stabilization
- **Box Shadow Removal:**
  - Removed all box shadow, elevation, and specular halo properties from the floating bottom navigation bar and the prompt input box per user request, adopting a completely flat, border-only minimalist aesthetic.
- **VirtualizedList Stabilization:**
  - In `apps/mobile/app/(tabs)/chat.js`, replaced nested `FlatList` in `attachmentStrip` with `<ScrollView horizontal>` to prevent VirtualizedList nesting conflicts.
  - Refactored `MarkdownMessage` to generate a flat 1D array of elements with distinct keys and removed inline padding/borderRadius from nested text spans which caused Android `SpannableStringBuilder` crashes during cell layout measurement.
  - Resolved `VirtualizedList` / `CellRenderer` crash by eliminating duplicate message IDs from cortex trajectory steps in `SdkAdapter.ts` (appending unique step indexes: `user-${executionId}-${i}` and `agent-${messageId}-${i}`).
  - Hardened client `keyExtractor` to `${item?.id || 'msg'}-${index}`, memoized `ChatMessageBubble` with `React.memo`, wrapped `renderItem` with `useCallback`, and configured `initialNumToRender`, `maxToRenderPerBatch`, `windowSize`, and `removeClippedSubviews`.

## 2026-11-10: Smooth Animated Keyboard Elevation & Elimination of White Flash
- **Root Cause of Keyboard Not Rising on Android:**
  - `KeyboardAvoidingView` was configured with `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`. On Android, `behavior=undefined` is a no-op that performs zero elevation.
  - In Expo Go SDK 58 on Android with edge-to-edge decor enabled, the window is not resized by the OS (`windowSoftInputMode` does not alter root window height).
  - Additionally, `isKeyboardOpen` dropped composer margin to `Math.max(insets.bottom, 10)`, leaving the composer buried beneath the soft keyboard.
- **Root Cause of White Flash:**
  - `UIManager.setLayoutAnimationEnabledExperimental(true)` and `LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)` were being executed on keyboard show.
  - Android's experimental layout animation invalidates dirty window regions globally during layout passes, revealing unpainted white native root surfaces before views finish drawing.
- **Smooth Animated Solution:**
  - Removed `LayoutAnimation` and experimental layout animations entirely.
  - Controlled `composerBottomAnim` using React Native's `Animated.timing` with `Easing.out(Easing.ease)`.
  - Added multi-listener subscriptions for both `keyboardWillShow` and `keyboardDidShow` (and corresponding hide events) to capture keyboard height immediately across both iOS and Android.
  - Elevated composer dynamically to `kHeight + 10` on keyboard open and restored smoothly to `Math.max(insets.bottom, 16) + 78` on keyboard hide.
  - Because `chatBody` has `flex: 1`, it contracts smoothly as the composer rises, keeping the messages feed and auto-scrolled content fully visible above the keyboard.
  - Updated `TabBar` to listen to `keyboardWillShow` to vanish instantly upon input focus without lag, and updated `_layout.js` scene style to match dynamic theme.

## 2026-11-11: Full Binary File and Image Transfer Pipeline
- **End-to-End File Delivery:**
  - Added authenticated endpoint `POST /v1/upload` in `BridgeServer.ts` protected by Bearer token authentication.
  - Files are saved to `.ag-remote/uploads/` with timestamp prefixes and strict path sanitization (`path.basename` and regex scrubbing) preventing directory traversal.
  - Increased `express.json` limit to `30mb` to accommodate large high-resolution camera photos and PDFs.
  - Supports both base64 JSON payload and streaming binary upload.
- **Mobile Client Integration:**
  - Implemented `uploadFile(profile, asset)` in `apps/mobile/src/api.js` using standard `fetch` + `FileReader.readAsDataURL` available in Expo Go without extra dependencies.
  - Updated `handleSend` in `chat.js` to upload all selected attachments before prompt dispatch, rolling back state if the upload fails to protect drafted messages.
  - Formatted prompt message with absolute file system paths on the host computer (`Saved to: <path>`), instructing the agent to directly inspect and view the uploaded image or document using `read_file`.
  - Added `.ag-remote/` to `.gitignore` to prevent tracking uploaded files.

## 2026-11-11: Chat Feed Auto-Scroll, Bubble Themes, Tab Labels & Left-Aligned Input
- **Complete Tab Labels:**
  - Configured `TabBar.js` labels with `numberOfLines={1}`, `ellipsizeMode="clip"`, `adjustsFontSizeToFit`, and `minimumFontScale={0.75}`.
  - Set `fontSize: 8.5`, `includeFontPadding: false` (to prevent Android native clipping), and increased tabbar horizontal padding, guaranteeing "Workspaces" and other tab names never wrap or truncate.
- **Initial Auto-Scroll on Open:**
  - Implemented multi-stage auto-scroll in `chat.js` triggered by `useFocusEffect`, `onContentSizeChange`, and `onLayout`.
  - When the user navigates to the Chat tab, the screen immediately jumps to the bottom without manual scrolling.
- **Monochrome User Bubble Inversion:**
  - Configured high-contrast monochrome inversion:
    - Dark mode: user bubble `#ffffff` with `#000000` text and badge elements.
    - Light mode: user bubble `#000000` with `#ffffff` text and badge elements.
- **Left-Aligned Input Placeholder:**
  - Set `TextInput` to fixed `textAlign: 'left'` with `paddingLeft: 4` and `paddingRight: 6` so the "Message your agent" placeholder and typed text start naturally at the far left edge of the pill composer.

## 2026-11-11: ChatGPT Grey User Bubbles, Inverted FlatList & Animated Working Indicator
- **ChatGPT-Style Grey User Bubbles:**
  - In dark mode: user bubble set to `#2f2f2f` with `#3d3d3d` border and `#ececec` text, matching the ChatGPT dark UI palette.
  - In light mode: user bubble set to `#f2f2f2` with `#e4e4e7` border and `#0d0d0d` text.
- **Inverted FlatList Architecture:**
  - Diagnosed why non-inverted `scrollToEnd()` required multiple button taps: with 50+ messages and dynamic markdown heights, VirtualizedList only measured the first rendered window, stopping short at partial content offsets.
  - Re-architected feed with `inverted={messages.length > 0}` and `reversedMessages`. Initial scroll offset is anchored at 0 (the latest response) natively on the very first frame.
  - Positioned `ListHeaderComponent` at the bottom (for live generation indicator) and `ListFooterComponent` at the top (for date headers).
  - Configured one-tap scroll-to-bottom button floating above composer when `offset.y > 140` scrolling smoothly back to offset 0.
- **Rich Animated Agent Working Indicator:**
  - Replaced static generation text with `AgentWorkingIndicator` featuring:
    - Pulsing glowing avatar animation (`Animated.loop`).
    - Glowing "THINKING" badge with pulsing accent dot.
    - Live monospace elapsed timer (`formatTime(seconds)`).
    - Dynamic cycling status phrases with smooth cross-fade transitions.
    - 3-dot bouncing wave animation.

## 2026-11-11: Desktop-Style File Links, Slower Working Transitions, Sending Bar & Follow-up Prompting
- **Desktop Antigravity File Links:**
  - Extended markdown `parseInline` regex to recognize `[label](file:///...)` and bare `file:///...` URIs.
  - Extracted clean basenames and optional line ranges (`#(L\d+(?:-L?\d+)?)`) from URIs and labels, formatting them as clean inline chips (`📄 filename.ext:lines`) with accent styling rather than displaying raw system paths.
- **Calm, Slower Working Status Transitions:**
  - Increased phrase rotation interval from 5500ms to 8000ms.
  - Separated the fade-out and fade-in animations so `phraseIndex` updates cleanly during complete fade-out (opacity 0) before fading smoothly back in over 600ms, eliminating abrupt text jumps.
- **Sending Progress & Duplicate Send Protection:**
  - Added `sendingStatus` state reporting upload progress (`Uploading (i/total): name...`) and agent delivery status (`Delivering prompt to agent...`).
  - Rendered a progress pill with `ActivityIndicator` above the composer while sending is in progress.
  - Disabled the input field, attachment picker, and send buttons while `sending` is true to prevent duplicate dispatches.
- **Simultaneous Stop and Follow-up Prompt Controls:**
  - When the agent is generating (`isWorking === true`), the composer now displays both the Stop button (red square) and the Send button side-by-side.
  - The Send button is enabled as soon as the user enters text or adds an attachment (`canSend`), allowing queued follow-up prompts into the active cascade without interrupting the ongoing run.

## 2026-11-11: Phase 4b Conversation Browsing, Switching & Background Approvals
- **Compliance & Credential Safety (R-18):**
  - Confirmed via `antigravity-sdk` `LEGAL.md` and terms review that the bridge operates strictly as a local IDE extension / tool integration.
  - No Google OAuth tokens, cookies, accounts, refresh tokens, or persistent cloud credentials are read, stored, transmitted, or touched anywhere.
  - All RPC communication connects exclusively to `127.0.0.1` on the local language server hub port using the ephemeral Language Server CSRF token (`--csrf_token` via `x-codeium-csrf-token`).
- **Workspace Scoping & Port Allocation (FR-34, Section 4.4):**
  - `GetAllCascadeTrajectories` ConnectRPC is scoped strictly to the workspace folder of the active language server process instance.
  - In multi-window environments, each IDE window spawns an independent language server process with its own hub port (e.g. PID 48498 port 36307 for `AG Remote`, PID 12184 port 34619 for `ShoeSite`).
  - Cross-workspace listing across multiple windows is deferred to the Phase 6 hub. The bridge currently connects to the workspace window in which it was launched.
- **REST Endpoints & Backward Compatibility Deviation (R-25):**
  - Implemented SRS endpoints:
    - `GET /v1/sessions`: lists all conversations with `id`, `title`, `stepCount`, `lastActivityAt`, `status`, and `workspace`.
    - `POST /v1/sessions`: creates a new conversation with optional initial text (`{ text?: string }`) using `StartCascade` with source 1 (`CORTEX_TRAJECTORY_SOURCE_USER`).
    - `POST /v1/sessions/:id/focus`: focuses the specified conversation in the IDE UI.
    - `POST /v1/sessions/:id/prompt`: dispatches a prompt to a specific active or background conversation without disrupting other windows.
    - `GET /v1/sessions/:id/messages?limit=N`: retrieves structured chat messages for any active or background conversation.
  - Kept legacy `POST /v1/prompt` and `GET /v1/messages` targeting the active conversation for backward compatibility with existing clients and mobile versions.
- **Background Approval Detection & Race Protection:**
  - `GetCascadeTrajectory` steps expose pending user interaction through `status === 'CORTEX_STEP_STATUS_WAITING'`.
  - Step classification derives approval kinds: `CODE_ACTION` or `EDIT_FILE` maps to `edit`, `COMMAND` or `TERMINAL` maps to `terminal`, and others map to `tool`.
  - VS Code approval commands (`antigravity.terminalCommand.accept`, `antigravity.agent.acceptAgentStep`, `antigravity.command.accept`) take no parameters and execute only on the currently active step in the editor UI.
  - For non-active sessions, the bridge first focuses the conversation (`antigravity.setVisibleConversation`), waits 150ms for the UI to activate, re-checks that the identical `requestId` is still pending, and only then executes the approval command. If the approval disappeared or changed during focus, it rejects with `STALE_REQUEST`.
- **State Machine Multi-Session Architecture (FR-35):**
  - Refactored `AgentStateMachine` from global status tracking to per-conversation status tracking (`sessionStatuses` and `sessionTitles` maps) while preserving the 2000ms debounce on `generating` -> `idle` transitions per conversation.
  - Added events `session_created` and `active_session_changed`. Enriched `run_finished`, `approval_requested`, and `message_appended` with `sessionId` and `sessionTitle`.
  - Push notifications now include the conversation title in the notification title and body.

## 2026-11-11: Mobile App & Web Client Multi-Conversation Browsing and Switching (Phase 5)
- **Mobile Session API & Schema Validation:**
  - Implemented `fetchSessions(profile)`, `createSession(profile, text)`, and `focusSession(profile, sessionId)` in `apps/mobile/src/api.js`.
  - Validated API responses using Zod schemas (`SessionSummarySchema`), returning typed session metadata safely to UI components.
  - Scoped message retrieval (`fetchMessages`) and prompt dispatch (`sendPrompt`, `sendStop`) with optional `sessionId` parameters.
- **Workspaces Tab Live Session Management:**
  - Transformed the Workspaces tab from a static screen into a live conversation hub for the connected IDE workspace.
  - Displays conversation cards with title, status badges (`RUNNING`, `APPROVAL`, `IDLE`), step counts, relative timestamps, and workspace indicators.
  - Tapping a conversation calls `focusSession` on the bridge and navigates seamlessly to the Chat tab with `sessionId`.
  - Added "+ New" modal for creating fresh conversations with optional initial prompts.
- **Chat Tab Quick-Switcher & Session Scoping:**
  - Added an interactive session bar below `TopBar` displaying the active conversation title, live status dot, and quick "+ New" button.
  - Tapping the session bar opens a slide-over Quick-Switcher modal listing all conversations with live status indicators, allowing instantaneous switching without leaving the chat feed.
  - All prompts, message streams, and abort actions automatically target the selected session ID.
  - WebSocket listeners update the active session title and status when `active_session_changed` or `session_created` events fire from the IDE.
- **Web Client Multi-Conversation Dropdown:**
  - Added `.session-bar` to `packages/bridge/src/webApp.ts` with a styled `<select id="sessionSelect">` and `+ New` button.
  - Populates session options dynamically via `GET /v1/sessions`, switches focus on change via `POST /v1/sessions/:id/focus`, and sends prompts scoped via `POST /v1/sessions/:id/prompt`.

## 2026-11-13: Splash Screen Redesign & Elimination of Home Page Overlay
- **Root Cause of Home Screen Overlay & Flash:**
  - The previous splash screen rendered inside a React Native `<Modal visible transparent>`.
  - In React Native (both native and web via React Portal), `<Modal>` has an asynchronous mounting/presentation cycle. The underlying `RootLayoutNav` painted the home screen first, causing the splash screen to pop up visibly as an overlay on top of the already-rendered home screen.
- **Root Layout Direct Rendering Architecture:**
  - Eliminated `<Modal>` completely from `SplashScreen.js`.
  - In `apps/mobile/app/_layout.js`, mounted `SplashScreen` directly in the root layout with `StyleSheet.absoluteFillObject`, `zIndex: 99999`, and `elevation: 99999`, over a solid pitch-black (`#000000`) container.
  - Intercepts all interactions during startup (`pointerEvents="auto"`) and occludes the underlying navigation tree completely on line 1 of the initial render without flash or delay.
  - When the splash sequence completes, smoothly fades out over 450ms and cleanly unmounts via `onFinished`, revealing the fully loaded and ready app.
- **Futuristic Antigravity Visual Design & Colors:**
  - Redesigned with the full Antigravity spectrum on deep OLED black (`#000000`):
    - Primary violet (`#7C5CFF`), electric cyber blue (`#4385F5`), electric cyan (`#25C9DF`), neon hot pink (`#ED5BA6`), emerald green (`#28C77B`), and solar amber (`#F1B83A`).
  - Choreographed multi-stage animations:
    - Multi-color breathing ambient nebula with layered floating glow auras.
    - Precision HUD corner brackets and reticles framing the viewport.
    - Concentric orbital gravitational rings with opposite-direction continuous rotations and glowing orbital satellite nodes.
    - Central Antigravity emblem featuring a squircle badge with dual neon corner brackets, levitation prism mark, bold "AG" typography, and a diagonal light shimmer sweep.
    - Letter-spaced "AG REMOTE" typography and "ANTIGRAVITY COMPANION" spectrum badge.
    - Dynamic telemetry pill with pulsing green beacon dot, live status transitions ("INITIALIZING ENGINE" -> "AGENT CORE READY"), and animated progress bar track.

## 2026-11-13: Push Notification Direct Mobile Deep-Linking & Web App Removal
- **Deprecation and Removal of Web Client (`/app`):**
  - Removed `webApp.ts` and the `/app` and `/app/*` HTTP routes from `BridgeServer`.
  - The standalone React Native mobile app now fully services multi-session chat, approvals, and terminal execution, rendering the temporary web fallback obsolete.
- **Direct Mobile Deep Linking in Push Notifications:**
  - Updated `NtfyNotifier` to generate mobile deep links with `sessionId` scoping:
    - **Expo Go (Current)**: `exp://<tailscaleIp>:8081/--/(tabs)/chat?sessionId=<sessionId>`
    - **Standalone APK**: `ag-remote://(tabs)/chat?sessionId=<sessionId>`
  - Primary `Click` header points directly to the active client target (defaulting to Expo Go in development).
  - Attached ntfy `Actions` providing 1-tap buttons for both Expo Go and Standalone APK, eliminating web browser fallbacks completely.
  - Forwarded `sessionId` through `notifyApprovalRequested` and `notifyRunFinished`.
- **Mobile Chat Auto-Loading on Deep-Link:**
  - In `apps/mobile/app/(tabs)/chat.js`, added immediate invocation of `loadMessages(params.sessionId)` when receiving deep-link parameters, ensuring that tapping a notification immediately switches to and displays that specific conversation's message history.

## 2026-11-13: Real-Time Agent Thinking, Tool Execution Streaming, Working Timer & Session Scoping
- **Live Agent Thinking & Tool Execution Streaming:**
  - Extended `ChatMessageSchema` with `kind` (`message` | `tool` | `thought`), `title`, `thinking`, `toolName`, `toolArgs`, `toolSummary`, and `toolStatus`.
  - In `SdkAdapter`, enhanced transcript parsing by inspecting both the active `transcript.jsonl` stream in `<brainDir>/<cascadeId>/.system_generated/logs/` and ConnectRPC trajectory steps.
  - Extracted real-time `thinking` blocks and `tool_calls` arrays (including command lines, file paths, and tool summaries).
  - Extended `StatusChangedEvent` and `AgentStateMachine` to broadcast current `action` and `thinking` previews to all connected clients over WebSockets.
- **Accurate Working Timer:**
  - Added tracking of the exact millisecond when each prompt was dispatched (`sessionWorkingStartedAt[sessionId]`).
  - Fallback resolution verifies the timestamp of the latest user prompt in the message history rather than falling back to `Date.now()`, preventing timer resets when intermediate tool or thought messages arrive.
  - Implemented live elapsed time formatter (`MM:SS` and `HH:MM:SS`) updated every second and synchronized with `AppState` changes.
- **Strict Session-Scoped Working Status:**
  - Fixed cross-session state leakage where a generating status in one session would display the working indicator at the bottom of unrelated conversations.
  - Replaced single global status checks with per-session tracking: `sessionStatuses[currentSessionId]`.
  - The working indicator and active generation controls only appear when the currently opened conversation matches a session in the `generating` state.
- **High-Performance UI & Low Latency Polling:**
  - Reduced active polling intervals from 1800ms down to 400ms while generating, paired with instant optimistic user message rendering and real-time WebSocket state notifications.
  - Added collapsible `ThoughtAccordion` with brain icon for deep agent reasoning, and expandable `ToolStepCard` for terminal and file tool actions.

## 2026-11-13: Offline Local Device Chat & Session Caching
- **Local Storage Abstraction (`storage.js`):**
  - Added `saveCachedSessions(sessions, profileId)` and `getCachedSessions(profileId)`.
  - Added `saveCachedMessages(sessionId, messages)` and `getCachedMessages(sessionId)` using on-device encrypted storage (`expo-secure-store` / `localStorage`).
  - Limits cached message storage per session to the latest 100 entries to maintain rapid load performance and prevent excessive storage utilization.
- **Instant Pre-load & Seamless Offline Access:**
  - In `loadMessages`, immediately reads cached sessions and cached conversation messages from local phone storage before network queries resolve, delivering instant instantaneous rendering.
  - In `handleSwitchSession`, instantly populates the message feed with that session's cached messages while the network request dispatches.
  - If the laptop is shut down or unreachable, the app gracefully maintains the cached conversations, allowing full browsing, history reading, and modal conversation switching completely offline.
- **Offline Telemetry & Composer Guards:**
  - Added `isOffline` detection. When offline and WebSocket is disconnected, `TopBar` displays `OFFLINE (CACHED)`, a persistent warning banner states `Viewing offline cached history · Laptop is currently unreachable`, and the prompt composer disables sending with placeholder `Laptop offline (viewing cached chat)`.
  - Re-engineered the offline banner styling with crisp high-contrast theme tokens (warm amber-charcoal `#1a140b` background with amber-100 `#fef3c7` text in dark mode; soft cream `#fef3c7` with deep amber-brown `#78350f` text in light mode), accompanied by a dedicated `OFFLINE` status pill.
- **Workspaces Screen Offline Support (`workspaces.js`):**
  - Integrated `getCachedSessions` and `saveCachedSessions` into `workspaces.js` alongside `useFocusEffect`.
  - Conversations list immediately populates from local phone storage even when the app is launched fresh after the laptop is powered down.
  - Tapping any cached conversation navigates to the Chat tab and displays that conversation's cached history.
  - Added a `CACHED` badge on the Conversations section when the laptop is unreachable, and disabled new conversation creation with a clear warning alert.






