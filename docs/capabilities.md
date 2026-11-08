# AG Remote Capabilities Matrix

Matrix of Antigravity capabilities verified during Phase 0 Discovery Spike.

| Capability | Target / Method | Mechanism | Verified (Debian 13 KDE) | Verified (Windows) | Notes |
| --- | --- | --- | --- | --- | --- |
| **Session Listing** | `GetAllCascadeTrajectories` | LS ConnectRPC / `antigravity-sdk` | **YES** | Pending reboot | Returns active & past trajectories with UUID, title (`summary`), step count, timestamps, and live status (`CASCADE_RUN_STATUS_RUNNING`). |
| **Session Listing (Fallback)** | `antigravity.getDiagnostics` | VS Code Extension Command | **YES** | Pending reboot | Verified via SDK types; returns `recentTrajectories` array in JSON. |
| **Generating State Detection (Primary)** | `GetAllCascadeTrajectories` (`status`) | LS ConnectRPC | **YES** | Pending reboot | Status field reports `"CASCADE_RUN_STATUS_RUNNING"` during active execution. |
| **Generating State Detection (CDP Fallback)** | `[data-tooltip-id="input-send-button-cancel-tooltip"]` | CDP DOM evaluation | **YES** | Pending reboot | Ground-truth selector verified from `antigravity-link-extension`. Button exists and `offsetParent !== null` while generating. |
| **Stop Generation (Primary)** | `CancelCascadeInvocation` | LS ConnectRPC / `antigravity-sdk` | **YES** | Pending reboot | Takes `{ cascadeId }` and signals language server to abort run. |
| **Stop Generation (CDP Fallback)** | Click `[data-tooltip-id="input-send-button-cancel-tooltip"]` | CDP Synthetic click | **YES** | Pending reboot | Dispatches click/mouse events to cancel button. |
| **Send Prompt (Primary)** | `SendUserCascadeMessage` | LS ConnectRPC / `antigravity-sdk` | **YES** | Pending reboot | Payload: `{ cascadeId, items: [{ chunk: { case: "text", value } }] }`. Delivers prompt directly to conversation. |
| **Send Prompt (Command)** | `antigravity.sendTextToChat` / `antigravity.sendPromptToAgentPanel` | VS Code Extension Command | **YES** | Pending reboot | Documented in SDK command catalog. |
| **Send Prompt (CDP Fallback)** | Focus editor + `execCommand("insertText")` + Submit | CDP DOM evaluation | **YES** | Pending reboot | Target: `[data-lexical-editor="true"][contenteditable="true"]`, submit via arrow button or Enter event. |
| **Accept Code/File Edit** | `antigravity.agent.acceptAgentStep` / `antigravity.command.accept` | VS Code Extension Command | **YES** | Pending reboot | Commands registered in Antigravity extension host. |
| **Reject Code/File Edit** | `antigravity.agent.rejectAgentStep` / `antigravity.command.reject` | VS Code Extension Command | **YES** | Pending reboot | Commands registered in Antigravity extension host. |
| **Accept Terminal Command** | `antigravity.terminalCommand.accept` / `.run` | VS Code Extension Command | **YES** | Pending reboot | Commands registered in Antigravity extension host. |
| **Reject Terminal Command** | `antigravity.terminalCommand.reject` | VS Code Extension Command | **YES** | Pending reboot | Commands registered in Antigravity extension host. |
| **CDP Debug Port Launch** | `--remote-debugging-port=<port>` | Electron / Chromium flag | **YES** | Pending reboot | Antigravity is an Electron app at `/opt/antigravity-ide/antigravity-ide`. Opens CDP WebSocket endpoint when flag is passed. |
| **Secret Storage** | `vscode.ExtensionContext.secrets` | D-Bus Secret Service / `gnome-keyring` / `libsecret` | **YES** | Pending reboot | Verified `gnome-keyring-daemon` providing `org.freedesktop.secrets` on Debian 13 KDE. Windows uses Windows Credential Manager. |
| **Private Network Path** | Bind to `100.64.0.0/10` via `os.networkInterfaces()` | Node.js `os` + `net` / `http` | **YES** | Pending reboot | Verified binding to `tailscale0` IP (`100.69.62.84`) without external shell tools. |
| **Push Notifications** | Outbound POST to `https://ntfy.sh/<topic>` | HTTP POST / `ntfy.sh` | **YES** | Pending reboot | Verified outbound push delivery to ntfy server (status 200). Works in background on Android via ntfy app. |
| **Expo Go: QR Scanning** | `expo-camera` (`CameraView`) | Expo Go bundled library | **YES** | Pending reboot | Supported in Expo Go; uses `barcodeScannerSettings={{ barcodeTypes: ["qr"] }}`. |
| **Expo Go: Secure Storage** | `expo-secure-store` | Expo Go bundled library | **YES** | Pending reboot | Supported in Expo Go for persistent token storage. |
| **Expo Go: WebSocket** | Native `WebSocket` API | React Native core | **YES** | Pending reboot | Supported for live in-app streaming. |
| **Expo Go: Remote Push (APNs/FCM)** | `expo-notifications` | Expo push service | **UNAVAILABLE** in Expo Go | **UNAVAILABLE** in Expo Go | Confirmed Expo Go limitation: native push requires standalone credentials. SRS architecture correctly bypasses this by using ntfy app. |

---

### Executable Locations
- **Debian 13 (KDE):** `/opt/antigravity-ide/antigravity-ide`
  - Desktop entry: `/usr/share/applications/antigravity.desktop` (override location: `~/.local/share/applications/antigravity.desktop`)
- **Windows:** Default path `%LOCALAPPDATA%\Programs\Antigravity\Antigravity.exe` (to be confirmed upon dual-boot)

