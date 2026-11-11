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
