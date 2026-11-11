export function renderWebClientHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>AG Remote</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #000000;
      --surface: #0a0a0c;
      --card: #141416;
      --border: #242428;
      --border-subtle: #1c1c20;
      --text: #ffffff;
      --text-sec: #9ca3af;
      --text-muted: #6b7280;
      --user-bubble: #ffffff;
      --user-text: #000000;
      --agent-bubble: #121215;
      --agent-text: #f3f4f6;
      --green: #10b981;
      --amber: #f59e0b;
      --red: #ef4444;
      --accent: #ffffff;
      --accent-inv: #000000;
      --bar-shadow: 0 16px 40px -4px rgba(0, 0, 0, 0.65), 0 4px 14px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1);
    }
    [data-theme="light"] {
      --bg: #f8fafc;
      --surface: #ffffff;
      --card: #ffffff;
      --border: #e2e8f0;
      --border-subtle: #edf2f7;
      --text: #09090b;
      --text-sec: #64748b;
      --text-muted: #94a3b8;
      --user-bubble: #000000;
      --user-text: #ffffff;
      --agent-bubble: #ffffff;
      --agent-text: #09090b;
      --green: #059669;
      --amber: #d97706;
      --red: #dc2626;
      --accent: #09090b;
      --accent-inv: #ffffff;
      --bar-shadow: 0 16px 36px -6px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.08);
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
      font-family: 'Poppins', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    html, body {
      height: 100%;
      height: 100dvh;
      width: 100%;
      max-width: 100vw;
      overflow-x: hidden !important;
      background: var(--bg);
      color: var(--text);
    }
    body {
      display: flex;
      flex-direction: column;
      position: relative;
      transition: background-color 0.2s ease, color 0.2s ease;
    }
    header {
      padding: 12px 18px;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--surface);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
      z-index: 20;
      width: 100%;
      box-sizing: border-box;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo-badge {
      width: 32px;
      height: 32px;
      border-radius: 9px;
      background: var(--accent);
      color: var(--accent-inv);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .logo-badge svg {
      width: 20px;
      height: 20px;
      display: block;
    }
    .header-title {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -0.3px;
    }
    .header-sub {
      font-size: 11px;
      color: var(--text-sec);
      font-weight: 400;
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      background: var(--card);
      border: 1px solid var(--border);
    }
    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--text-muted);
    }
    .status-idle .status-dot { background: var(--text-muted); }
    .status-generating .status-dot { background: var(--green); box-shadow: 0 0 8px var(--green); }
    .status-awaiting_approval .status-dot { background: var(--amber); box-shadow: 0 0 8px var(--amber); }
    .status-error .status-dot { background: var(--red); }
    .icon-btn {
      background: var(--card);
      border: 1px solid var(--border);
      color: var(--text);
      width: 34px;
      height: 34px;
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 14px;
      transition: background 0.15s ease;
    }
    .icon-btn:active {
      transform: scale(0.94);
    }
    .system-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 18px;
      font-size: 12px;
      font-weight: 600;
      animation: slideDown 0.2s ease;
      flex-shrink: 0;
      z-index: 18;
      border-bottom: 1px solid var(--border);
      box-sizing: border-box;
      width: 100%;
    }
    .banner-degraded {
      background: rgba(245, 158, 11, 0.12);
      color: var(--amber);
      border-color: rgba(245, 158, 11, 0.3);
    }
    .banner-offline {
      background: rgba(239, 68, 68, 0.12);
      color: var(--red);
      border-color: rgba(239, 68, 68, 0.3);
    }
    .banner-icon {
      font-size: 14px;
      flex-shrink: 0;
    }
    #mainContent {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow-x: hidden !important;
      overflow-y: hidden;
      width: 100%;
      max-width: 100vw;
      position: relative;
    }
    #approvalCard {
      display: none;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 14px 18px;
      animation: slideDown 0.25s ease;
      flex-shrink: 0;
      z-index: 15;
      width: 100%;
      box-sizing: border-box;
    }
    @keyframes slideDown {
      from { transform: translateY(-100%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .approval-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .approval-tag {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 1px;
      padding: 3px 8px;
      border-radius: 5px;
      background: var(--card);
      border: 1px solid var(--border);
      text-transform: uppercase;
      color: var(--amber);
    }
    .approval-summary {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      line-height: 1.5;
      background: var(--card);
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid var(--border);
      color: var(--text);
      max-height: 120px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
      margin-bottom: 12px;
    }
    .session-bar {
      padding: 8px 18px;
      background: var(--surface);
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-shrink: 0;
      z-index: 10;
    }
    .session-selector-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      min-width: 0;
    }
    .session-select {
      background: var(--card);
      border: 1px solid var(--border);
      color: var(--text);
      font-size: 12px;
      font-weight: 500;
      padding: 6px 10px;
      border-radius: 8px;
      flex: 1;
      min-width: 0;
      outline: none;
      cursor: pointer;
    }
    .btn-new-session {
      background: var(--card);
      border: 1px solid var(--border);
      color: var(--text);
      font-size: 11px;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 8px;
      cursor: pointer;
      white-space: nowrap;
    }
    .btn-new-session:hover {
      background: var(--border-subtle);
    }
    .approval-actions {
      display: flex;
      gap: 10px;
    }
    .btn-approve {
      flex: 1;
      background: var(--accent);
      color: var(--accent-inv);
      border: none;
      padding: 10px;
      border-radius: 9px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
    }
    .btn-reject {
      padding: 10px 16px;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--red);
      border-radius: 9px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
    }
    #messagesContainer {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden !important;
      padding: 16px 16px 115px 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      width: 100%;
      max-width: 720px;
      margin: 0 auto;
      box-sizing: border-box;
      scroll-behavior: smooth;
    }
    .message-row {
      display: flex;
      flex-direction: column;
      max-width: 86%;
      box-sizing: border-box;
      word-break: break-word;
      overflow-wrap: anywhere;
    }
    .message-user {
      align-self: flex-end;
      align-items: flex-end;
    }
    .message-agent {
      align-self: flex-start;
      align-items: flex-start;
    }
    .bubble {
      padding: 13px 18px;
      border-radius: 22px;
      font-size: 14px;
      line-height: 1.6;
      word-break: break-word;
      overflow-wrap: anywhere;
      max-width: 100%;
      box-sizing: border-box;
    }
    .message-user .bubble {
      background: var(--user-bubble);
      color: var(--user-text);
      border-bottom-right-radius: 4px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.14);
      font-weight: 500;
      white-space: pre-wrap;
    }
    .message-agent .bubble {
      background: var(--agent-bubble);
      color: var(--agent-text);
      border-bottom-left-radius: 4px;
      border: 1px solid var(--border-subtle);
      box-shadow: 0 2px 10px rgba(0,0,0,0.06);
    }
    .message-meta {
      font-size: 10px;
      color: var(--text-muted);
      margin-top: 5px;
      padding: 0 4px;
    }
    .md-h1 { font-size: 18px; font-weight: 800; margin: 12px 0 6px 0; color: var(--text); }
    .md-h2 { font-size: 16px; font-weight: 700; margin: 10px 0 6px 0; color: var(--text); }
    .md-h3 { font-size: 14px; font-weight: 700; margin: 8px 0 4px 0; color: var(--text); }
    .md-para-gap { height: 8px; }
    .md-li { margin-left: 20px; margin-bottom: 4px; list-style-type: disc; }
    .md-link { color: var(--text); text-decoration: underline; word-break: break-all; }
    .inline-code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12.5px;
      background: rgba(128,128,128,0.22);
      padding: 2px 6px;
      border-radius: 5px;
      font-weight: 500;
    }
    .code-block {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      background: #09090b;
      color: #fafafa;
      padding: 12px 14px;
      border-radius: 10px;
      border: 1px solid #27272a;
      overflow-x: auto;
      max-width: 100%;
      white-space: pre-wrap;
      word-break: break-all;
      margin: 8px 0;
      line-height: 1.5;
      box-sizing: border-box;
    }
    .empty-state {
      margin: auto;
      text-align: center;
      padding: 40px 20px;
      color: var(--text-muted);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }
    .empty-icon-wrap {
      width: 56px;
      height: 56px;
      border-radius: 18px;
      background: var(--card);
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 6px;
      color: var(--text);
    }
    .empty-icon-wrap svg {
      width: 30px;
      height: 30px;
    }
    .floating-bar-wrapper {
      position: fixed;
      bottom: max(18px, env(safe-area-inset-bottom, 18px));
      left: 50%;
      transform: translateX(-50%);
      width: calc(100% - 28px);
      max-width: 680px;
      box-sizing: border-box;
      z-index: 50;
      pointer-events: none;
    }
    .floating-bar {
      pointer-events: auto;
      display: flex;
      align-items: center;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 9999px;
      padding: 6px 8px 6px 20px;
      box-shadow: var(--bar-shadow);
      gap: 8px;
      width: 100%;
      min-height: 54px;
      box-sizing: border-box;
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    .floating-bar:focus-within {
      border-color: var(--text-sec);
    }
    #promptInput {
      flex: 1;
      min-width: 0;
      background: transparent;
      border: none;
      outline: none;
      color: var(--text);
      font-size: 15px;
      font-weight: 500;
      padding: 10px 0;
    }
    #promptInput::placeholder {
      color: var(--text-muted);
      font-weight: 400;
    }
    .bar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .btn-stop-circle {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: #ffffff;
      border: 1px solid rgba(0,0,0,0.12);
      color: #000000;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
      transition: transform 0.15s ease, opacity 0.15s ease;
    }
    .btn-stop-circle:active {
      transform: scale(0.90);
    }
    .btn-stop-circle svg {
      width: 14px;
      height: 14px;
      display: block;
    }
    .btn-send {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: var(--accent);
      color: var(--accent-inv);
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      transition: transform 0.15s ease, opacity 0.15s ease;
    }
    .btn-send:active {
      transform: scale(0.90);
    }
    .btn-send:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .btn-send svg {
      width: 16px;
      height: 16px;
      display: block;
    }
    .working-bubble-row {
      display: none;
      margin-top: 4px;
      animation: fadeIn 0.25s ease;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .working-bubble {
      display: flex;
      align-items: center;
      gap: 10px;
      background: var(--card);
      border: 1px solid var(--border);
      color: var(--text-sec);
      padding: 10px 16px;
      border-radius: 20px;
      border-bottom-left-radius: 4px;
      font-size: 13px;
      font-weight: 500;
    }
    .working-spinner {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .working-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--green);
      animation: pulseDot 1.4s infinite ease-in-out both;
    }
    .working-dot:nth-child(1) { animation-delay: -0.32s; }
    .working-dot:nth-child(2) { animation-delay: -0.16s; }
    .working-dot:nth-child(3) { animation-delay: 0s; }
    @keyframes pulseDot {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.35; }
      40% { transform: scale(1.1); opacity: 1; }
    }
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.7);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      z-index: 100;
    }
    .modal-box {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 24px;
      max-width: 440px;
      width: 100%;
      box-shadow: 0 20px 50px rgba(0,0,0,0.5);
    }
    .modal-title {
      font-size: 17px;
      font-weight: 700;
      margin-bottom: 12px;
    }
    .field-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.8px;
      color: var(--text-sec);
      margin: 12px 0 6px 0;
      text-transform: uppercase;
    }
    .field-input {
      width: 100%;
      background: var(--card);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 12px 14px;
      border-radius: 10px;
      font-size: 13px;
      outline: none;
    }
    .field-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin: 16px 0 8px 0;
    }
    .switch-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--text);
    }
    .time-inputs {
      display: flex;
      gap: 12px;
      align-items: center;
      margin-top: 8px;
    }
    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 20px;
    }
    .btn-modal-cancel {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text);
      padding: 9px 16px;
      border-radius: 9px;
      font-size: 13px;
      cursor: pointer;
    }
    .btn-modal-save {
      background: var(--accent);
      color: var(--accent-inv);
      border: none;
      padding: 9px 18px;
      border-radius: 9px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <header>
    <div class="header-left">
      <div class="logo-badge" title="AG Remote">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 2 22 22 22 12 2" fill="currentColor" stroke="none" />
          <circle cx="12" cy="14" r="3" fill="var(--bg)" stroke="none" />
        </svg>
      </div>
      <div>
        <div class="header-title">AG Remote</div>
        <div class="header-sub">Antigravity Controller</div>
      </div>
    </div>
    <div class="header-right">
      <div id="statusPill" class="status-pill status-idle">
        <span class="status-dot"></span>
        <span id="statusText">IDLE</span>
      </div>
      <button id="themeToggleBtn" class="icon-btn" title="Toggle theme">◐</button>
      <button id="settingsBtn" class="icon-btn" title="Token Settings">⚙</button>
    </div>
  </header>

  <div class="session-bar" id="sessionBar">
    <div class="session-selector-wrap">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <select id="sessionSelect" class="session-select"><option value="">Active Conversation</option></select>
    </div>
    <button id="btnNewSession" class="btn-new-session">+ New</button>
  </div>

  <div id="degradedBanner" class="system-banner banner-degraded" style="display:none;">
    <span class="banner-icon">⚠</span>
    <span id="degradedText">Bridge running in degraded mode</span>
  </div>
  <div id="offlineBanner" class="system-banner banner-offline" style="display:none;">
    <span class="banner-icon">⚡</span>
    <span>Disconnected from bridge. Reconnecting...</span>
  </div>

  <div id="mainContent">
    <div id="approvalCard">
      <div class="approval-header">
        <span id="approvalKind" class="approval-tag">APPROVAL REQUEST</span>
        <span style="font-size: 11px; color: var(--text-muted);">Action required</span>
      </div>
      <div id="approvalSummary" class="approval-summary"></div>
      <div class="approval-actions">
        <button id="approveBtn" class="btn-approve">Approve Action</button>
        <button id="rejectBtn" class="btn-reject">Reject</button>
      </div>
    </div>

    <div id="messagesContainer">
      <div class="empty-state">
        <div class="empty-icon-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 2 22 22 22 12 2" fill="currentColor" stroke="none" />
            <circle cx="12" cy="14" r="3.5" fill="var(--bg)" stroke="none" />
          </svg>
        </div>
        <p style="font-weight: 700; font-size: 16px; margin-bottom: 2px;">Connected to Antigravity</p>
        <p style="font-size: 13px;">Type a prompt below to interact with Cascade agent.</p>
      </div>
    </div>
  </div>

  <div class="floating-bar-wrapper">
    <div class="floating-bar">
      <input id="promptInput" type="text" placeholder="Message Antigravity..." autocomplete="off">
      <div class="bar-actions">
        <button id="btnStop" class="btn-stop-circle" title="Stop Generation">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <rect x="5" y="5" width="14" height="14" rx="2.5" />
          </svg>
        </button>
        <button id="btnSend" class="btn-send" title="Send Prompt">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="19" x2="12" y2="5"></line>
            <polyline points="5 12 12 5 19 12"></polyline>
          </svg>
        </button>
      </div>
    </div>
  </div>

  <div id="settingsModal" class="modal-overlay">
    <div class="modal-box">
      <div class="modal-title">Bridge Configuration</div>
      <div class="field-label">Bearer Token</div>
      <input id="tokenInput" class="field-input" type="password" placeholder="64-character hex secret">

      <div class="field-row">
        <label class="switch-label" for="quietHoursToggle">Quiet Hours (Mute Run Finished alerts)</label>
        <input id="quietHoursToggle" type="checkbox" style="width: 18px; height: 18px; cursor: pointer;">
      </div>
      <div id="quietHoursInputs" class="time-inputs" style="display: none;">
        <div style="flex: 1;">
          <div class="field-label">Start Hour (0-23)</div>
          <input id="quietStartInput" class="field-input" type="number" min="0" max="23" value="23">
        </div>
        <div style="flex: 1;">
          <div class="field-label">End Hour (0-23)</div>
          <input id="quietEndInput" class="field-input" type="number" min="0" max="23" value="7">
        </div>
      </div>

      <div class="modal-actions">
        <button id="btnModalCancel" class="btn-modal-cancel">Cancel</button>
        <button id="btnModalSave" class="btn-modal-save">Save Settings</button>
      </div>
    </div>
  </div>

  <script>
    let token = localStorage.getItem('ag_remote_token') || '';
    let currentApproval = null;
    let ws = null;
    let latestStatus = 'idle';

    const urlParams = new URLSearchParams(window.location.search);
    const queryToken = urlParams.get('token');
    if (queryToken) {
      token = queryToken;
      localStorage.setItem('ag_remote_token', token);
    }

    const savedTheme = localStorage.getItem('ag_remote_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    document.getElementById('themeToggleBtn').addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('ag_remote_theme', next);
    });

    const settingsModal = document.getElementById('settingsModal');
    const tokenInput = document.getElementById('tokenInput');
    const quietToggle = document.getElementById('quietHoursToggle');
    const quietInputs = document.getElementById('quietHoursInputs');
    const quietStart = document.getElementById('quietStartInput');
    const quietEnd = document.getElementById('quietEndInput');

    quietToggle.addEventListener('change', () => {
      quietInputs.style.display = quietToggle.checked ? 'flex' : 'none';
    });

    document.getElementById('settingsBtn').addEventListener('click', () => {
      tokenInput.value = token;
      loadQuietHours();
      settingsModal.style.display = 'flex';
    });

    document.getElementById('btnModalCancel').addEventListener('click', () => {
      settingsModal.style.display = 'none';
    });

    document.getElementById('btnModalSave').addEventListener('click', async () => {
      token = tokenInput.value.trim();
      localStorage.setItem('ag_remote_token', token);

      const qhPayload = {
        enabled: quietToggle.checked,
        startHour: parseInt(quietStart.value, 10) || 23,
        endHour: parseInt(quietEnd.value, 10) || 7
      };
      await apiCall('/v1/settings', 'POST', qhPayload);

      settingsModal.style.display = 'none';
      checkDegradedStatus();
      refreshState();
      refreshMessages();
      initWebSocket();
    });

    async function loadQuietHours() {
      const res = await apiCall('/v1/settings');
      if (res && res.quietHours) {
        quietToggle.checked = Boolean(res.quietHours.enabled);
        quietStart.value = res.quietHours.startHour ?? 23;
        quietEnd.value = res.quietHours.endHour ?? 7;
        quietInputs.style.display = quietToggle.checked ? 'flex' : 'none';
      }
    }

    async function checkDegradedStatus() {
      try {
        const res = await fetch('/health');
        if (res.ok) {
          const health = await res.json();
          const degradedBanner = document.getElementById('degradedBanner');
          if (health && health.status === 'degraded') {
            degradedBanner.style.display = 'flex';
            document.getElementById('degradedText').textContent = health.degradedReason || 'Bridge running in degraded fallback mode';
          } else {
            degradedBanner.style.display = 'none';
          }
        }
      } catch {}
    }

    async function apiCall(endpoint, method, body) {
      if (!token) {
        settingsModal.style.display = 'flex';
        return null;
      }
      try {
        const opts = {
          method: method || 'GET',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
          }
        };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(endpoint, opts);
        if (res.status === 401) {
          settingsModal.style.display = 'flex';
          return null;
        }
        return await res.json();
      } catch (err) {
        return null;
      }
    }

    async function refreshState() {
      const state = await apiCall('/v1/state');
      if (state) updateUI(state);
    }

    function renderMarkdown(md) {
      if (!md) return '';
      const tripleTick = String.fromCharCode(96, 96, 96);
      const singleTick = String.fromCharCode(96);

      const blocks = md.split(tripleTick);
      const renderedBlocks = blocks.map(function(block, i) {
        if (i % 2 === 1) {
          let code = block;
          const firstNl = block.indexOf('\\n');
          if (firstNl !== -1) {
            code = block.slice(firstNl + 1);
          }
          return '<pre class="code-block"><code>' + escapeHtml(code.trimEnd()) + '</code></pre>';
        }

        const inlines = block.split(singleTick);
        const renderedInlines = inlines.map(function(part, j) {
          if (j % 2 === 1) {
            return '<code class="inline-code">' + escapeHtml(part) + '</code>';
          }
          let t = escapeHtml(part);
          t = t.replace(/(?:^|\\n)###\\s+([^\\n]+)/g, '<h3 class="md-h3">$1</h3>');
          t = t.replace(/(?:^|\\n)##\\s+([^\\n]+)/g, '<h2 class="md-h2">$1</h2>');
          t = t.replace(/(?:^|\\n)#\\s+([^\\n]+)/g, '<h1 class="md-h1">$1</h1>');
          t = t.replace(/\\*\\*([^\\*]+)\\*\\*/g, '<strong>$1</strong>');
          t = t.replace(/\\*([^\\*]+)\\*/g, '<em>$1</em>');
          t = t.replace(/(?:^|\\n)[-*•]\\s+([^\\n]+)/g, '<li class="md-li">$1</li>');
          t = t.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="md-link">$1</a>');
          t = t.replace(/\\n\\n+/g, '<div class="md-para-gap"></div>');
          t = t.replace(/\\n/g, '<br>');
          return t;
        });
        return renderedInlines.join('');
      });

      return renderedBlocks.join('');
    }

    let currentSessionId = null;

    async function refreshSessions() {
      const sessions = await apiCall('/v1/sessions');
      if (!Array.isArray(sessions)) return;

      const select = document.getElementById('sessionSelect');
      const prevVal = currentSessionId || select.value;
      select.innerHTML = '';

      sessions.forEach(function(s) {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = (s.title || 'Untitled') + (s.status === 'generating' ? ' (running)' : '');
        select.appendChild(opt);
      });

      if (prevVal && sessions.some(function(s) { return s.id === prevVal; })) {
        select.value = prevVal;
        currentSessionId = prevVal;
      } else if (sessions.length > 0) {
        currentSessionId = sessions[0].id;
        select.value = sessions[0].id;
      }
    }

    async function handleSessionChange() {
      const select = document.getElementById('sessionSelect');
      const targetId = select.value;
      if (!targetId || targetId === currentSessionId) return;
      currentSessionId = targetId;
      await apiCall('/v1/sessions/' + encodeURIComponent(targetId) + '/focus', 'POST');
      refreshState();
      refreshMessages();
    }

    async function handleNewSession() {
      const promptText = window.prompt('Enter initial prompt for new conversation (optional):');
      if (promptText === null) return;
      const res = await apiCall('/v1/sessions', 'POST', { text: promptText.trim() || undefined });
      if (res && res.sessionId) {
        currentSessionId = res.sessionId;
        await refreshSessions();
        refreshState();
        refreshMessages();
      }
    }

    async function refreshMessages() {
      const url = currentSessionId
        ? '/v1/sessions/' + encodeURIComponent(currentSessionId) + '/messages?limit=50'
        : '/v1/messages?limit=50';
      const messages = await apiCall(url);
      if (!Array.isArray(messages)) return;

      const container = document.getElementById('messagesContainer');
      const wasAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 80;

      if (messages.length === 0 && latestStatus !== 'generating') {
        container.innerHTML = '<div class="empty-state">' +
          '<div class="empty-icon-wrap">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<polygon points="12 2 2 22 22 22 12 2" fill="currentColor" stroke="none" />' +
          '<circle cx="12" cy="14" r="3.5" fill="var(--bg)" stroke="none" />' +
          '</svg>' +
          '</div>' +
          '<p style="font-weight: 700; font-size: 16px; margin-bottom: 2px;">Connected to Antigravity</p>' +
          '<p style="font-size: 13px;">Type a prompt below to interact with Cascade agent.</p>' +
          '</div>';
        return;
      }

      let html = messages.map(function(m) {
        const isUser = m.role === 'user';
        const timeStr = m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const bodyHtml = isUser ? escapeHtml(m.text) : renderMarkdown(m.text);
        const metaStr = (isUser ? 'You' : 'Antigravity') + (timeStr ? ' · ' + timeStr : '');
        return '<div class="message-row ' + (isUser ? 'message-user' : 'message-agent') + '">' +
          '<div class="bubble">' + bodyHtml + '</div>' +
          '<div class="message-meta">' + metaStr + '</div>' +
          '</div>';
      }).join('');

      if (latestStatus === 'generating') {
        html += '<div id="liveWorkingRow" class="message-row message-agent working-bubble-row" style="display:flex;">' +
          '<div class="bubble working-bubble">' +
          '<span class="working-spinner">' +
          '<span class="working-dot"></span><span class="working-dot"></span><span class="working-dot"></span>' +
          '</span>' +
          '<span>Antigravity is working...</span>' +
          '</div>' +
          '</div>';
      }

      container.innerHTML = html;
      if (wasAtBottom || latestStatus === 'generating') {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function updateUI(state) {
      const pill = document.getElementById('statusPill');
      const text = document.getElementById('statusText');
      const banner = document.getElementById('approvalCard');

      latestStatus = state.status || 'idle';
      pill.className = 'status-pill status-' + latestStatus;
      text.textContent = latestStatus.replace('_', ' ');

      currentApproval = state.pendingApproval;
      if (state.pendingApproval) {
        banner.style.display = 'block';
        document.getElementById('approvalKind').textContent = state.pendingApproval.kind + ' APPROVAL';
        document.getElementById('approvalSummary').textContent = state.pendingApproval.summary;
      } else {
        banner.style.display = 'none';
      }

      const existingWorkingRow = document.getElementById('liveWorkingRow');
      if (latestStatus === 'generating') {
        if (!existingWorkingRow) {
          refreshMessages();
        }
      } else if (existingWorkingRow) {
        existingWorkingRow.remove();
      }
    }

    async function handleSendPrompt() {
      const input = document.getElementById('promptInput');
      const text = input.value.trim();
      if (!text) return;
      document.getElementById('btnSend').disabled = true;
      latestStatus = 'generating';
      updateUI({ status: 'generating', pendingApproval: currentApproval });
      const url = currentSessionId
        ? '/v1/sessions/' + encodeURIComponent(currentSessionId) + '/prompt'
        : '/v1/prompt';
      const res = await apiCall(url, 'POST', { text });
      document.getElementById('btnSend').disabled = false;
      if (res && res.ok) {
        input.value = '';
        refreshState();
        refreshMessages();
      }
    }

    async function handleApprove() {
      if (!currentApproval) return;
      document.getElementById('approveBtn').disabled = true;
      const res = await apiCall('/v1/approve', 'POST', { requestId: currentApproval.requestId });
      document.getElementById('approveBtn').disabled = false;
      if (res && res.ok) {
        currentApproval = null;
        document.getElementById('approvalCard').style.display = 'none';
        refreshState();
      }
    }

    async function handleReject() {
      if (!currentApproval) return;
      document.getElementById('rejectBtn').disabled = true;
      const res = await apiCall('/v1/reject', 'POST', { requestId: currentApproval.requestId });
      document.getElementById('rejectBtn').disabled = false;
      if (res && res.ok) {
        currentApproval = null;
        document.getElementById('approvalCard').style.display = 'none';
        refreshState();
      }
    }

    async function handleStop() {
      const url = currentSessionId
        ? '/v1/stop?sessionId=' + encodeURIComponent(currentSessionId)
        : '/v1/stop';
      await apiCall(url, 'POST');
      refreshState();
    }

    document.getElementById('btnSend').addEventListener('click', handleSendPrompt);
    document.getElementById('promptInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSendPrompt();
    });
    document.getElementById('approveBtn').addEventListener('click', handleApprove);
    document.getElementById('rejectBtn').addEventListener('click', handleReject);
    document.getElementById('btnStop').addEventListener('click', handleStop);
    document.getElementById('sessionSelect').addEventListener('change', handleSessionChange);
    document.getElementById('btnNewSession').addEventListener('click', handleNewSession);

    function initWebSocket() {
      if (!token) return;
      if (ws) {
        try { ws.close(); } catch {}
      }
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = proto + '//' + window.location.host + '/v1/stream?token=' + encodeURIComponent(token);
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        document.getElementById('offlineBanner').style.display = 'none';
      };

      ws.onmessage = () => {
        refreshState();
        refreshSessions();
        refreshMessages();
      };

      ws.onerror = () => {
        document.getElementById('offlineBanner').style.display = 'flex';
      };

      ws.onclose = () => {
        document.getElementById('offlineBanner').style.display = 'flex';
        setTimeout(initWebSocket, 3000);
      };
    }

    if (!token) {
      settingsModal.style.display = 'flex';
    } else {
      checkDegradedStatus();
      refreshState();
      refreshSessions();
      refreshMessages();
      initWebSocket();
    }
  </script>
</body>
</html>`;
}
