export function renderWebClientHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>AG Remote</title>
  <style>
    :root {
      --bg: #1e1e1e;
      --card-bg: #252526;
      --border: #3c3c3c;
      --text: #cccccc;
      --text-bright: #ffffff;
      --accent: #0e639c;
      --accent-hover: #1177bb;
      --green: #2ea043;
      --green-hover: #3fb950;
      --red: #da3633;
      --red-hover: #f85149;
      --amber: #d29922;
      --bubble-user: #2d3748;
      --bubble-agent: #1e293b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 16px;
      line-height: 1.4;
      max-width: 600px;
      margin: 0 auto;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    h1 { font-size: 1.25rem; color: var(--text-bright); }
    .status-badge {
      font-size: 0.75rem;
      padding: 4px 8px;
      border-radius: 12px;
      text-transform: uppercase;
      font-weight: bold;
    }
    .status-idle { background: #3c3c3c; color: #aaa; }
    .status-generating { background: var(--accent); color: white; }
    .status-awaiting_approval { background: var(--amber); color: black; }
    .status-error { background: var(--red); color: white; }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .card h2 {
      font-size: 1rem;
      color: var(--text-bright);
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .tag {
      font-size: 0.7rem;
      padding: 2px 6px;
      border-radius: 4px;
      background: #333;
      color: #aaa;
    }
    .summary-box {
      background: #181818;
      border: 1px solid var(--border);
      padding: 12px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 0.85rem;
      color: #e6e6e6;
      word-break: break-word;
      margin: 12px 0;
      white-space: pre-wrap;
    }
    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 12px;
    }
    button {
      padding: 12px 16px;
      border: none;
      border-radius: 6px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
    }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-approve { background: var(--green); }
    .btn-approve:active { background: var(--green-hover); }
    .btn-reject { background: var(--red); }
    .btn-reject:active { background: var(--red-hover); }
    .btn-prompt { background: var(--accent); width: 100%; margin-top: 8px; }
    .btn-prompt:active { background: var(--accent-hover); }
    .btn-stop { background: #333; color: #ff7b72; margin-top: 8px; width: 100%; border: 1px solid #444; }

    textarea, input[type="text"] {
      width: 100%;
      padding: 10px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: #181818;
      color: white;
      margin-top: 6px;
      font-family: inherit;
      font-size: 0.95rem;
    }
    textarea { min-height: 70px; resize: vertical; }
    .notice { font-size: 0.85rem; color: #888; margin-top: 8px; }

    .chat-container {
      max-height: 350px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 8px;
      padding-right: 4px;
    }
    .chat-bubble {
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 0.9rem;
      word-break: break-word;
      white-space: pre-wrap;
    }
    .bubble-user {
      align-self: flex-end;
      background: var(--bubble-user);
      color: #90cdf4;
      border-bottom-right-radius: 2px;
    }
    .bubble-agent {
      align-self: flex-start;
      background: var(--bubble-agent);
      color: #e2e8f0;
      border-bottom-left-radius: 2px;
      border: 1px solid #334155;
    }
    .bubble-meta {
      font-size: 0.7rem;
      color: #718096;
      margin-top: 4px;
      display: block;
    }
  </style>
</head>
<body>
  <header>
    <h1>AG Remote</h1>
    <span id="statusBadge" class="status-badge status-idle">Connecting...</span>
  </header>

  <div id="authSection" class="card" style="display: none;">
    <h2>Pairing Bearer Token</h2>
    <p class="notice">Enter the 64-character bearer token from your PC.</p>
    <input type="text" id="tokenInput" placeholder="Paste bearer token">
    <button class="btn-prompt" onclick="saveToken()">Save Token</button>
  </div>

  <div id="approvalCard" class="card" style="display: none; border-color: var(--amber);">
    <h2>
      <span>Pending Approval</span>
      <span id="approvalKind" class="tag">terminal</span>
    </h2>
    <div id="approvalSummary" class="summary-box"></div>
    <div class="actions">
      <button class="btn-approve" id="approveBtn" onclick="handleApprove()">Approve</button>
      <button class="btn-reject" id="rejectBtn" onclick="handleReject()">Reject</button>
    </div>
  </div>

  <div class="card">
    <h2>Prompt Agent</h2>
    <textarea id="promptInput" placeholder="Type prompt to send to active conversation..."></textarea>
    <button class="btn-prompt" id="sendPromptBtn" onclick="handleSendPrompt()">Send Prompt</button>
    <button class="btn-stop" id="stopBtn" onclick="handleStop()">Stop Run</button>
  </div>

  <div class="card">
    <h2>Recent Messages</h2>
    <div id="chatMessages" class="chat-container">
      <p style="color: #666; font-size: 0.85rem;">No recent messages loaded.</p>
    </div>
  </div>

  <script>
    let token = localStorage.getItem('ag_remote_token') || '';
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('token')) {
      token = urlParams.get('token');
      localStorage.setItem('ag_remote_token', token);
    }

    let currentApproval = null;
    let ws = null;

    function saveToken() {
      const val = document.getElementById('tokenInput').value.trim();
      if (val) {
        token = val;
        localStorage.setItem('ag_remote_token', val);
        document.getElementById('authSection').style.display = 'none';
        refreshState();
        refreshMessages();
        initWebSocket();
      }
    }

    async function apiCall(path, method = 'GET', body = null) {
      if (!token) {
        document.getElementById('authSection').style.display = 'block';
        return null;
      }
      const opt = {
        method,
        headers: {
          'Authorization': 'Bearer ' + token
        }
      };
      if (body) {
        opt.headers['Content-Type'] = 'application/json';
        opt.body = JSON.stringify(body);
      }
      const res = await fetch(path, opt);
      if (res.status === 401) {
        document.getElementById('authSection').style.display = 'block';
        return null;
      }
      return res.json();
    }

    async function refreshState() {
      const state = await apiCall('/v1/state');
      if (!state) return;
      updateUI(state);
    }

    async function refreshMessages() {
      const msgs = await apiCall('/v1/messages?limit=15');
      if (!Array.isArray(msgs)) return;
      const container = document.getElementById('chatMessages');
      if (msgs.length === 0) {
        container.innerHTML = '<p style="color: #666; font-size: 0.85rem;">No messages yet.</p>';
        return;
      }
      container.innerHTML = msgs.map(m => {
        const roleClass = m.role === 'user' ? 'bubble-user' : 'bubble-agent';
        const roleLabel = m.role === 'user' ? 'User' : 'Antigravity Agent';
        const time = new Date(m.timestamp).toLocaleTimeString();
        return '<div class="chat-bubble ' + roleClass + '"><strong>' + roleLabel + '</strong><br>' +
          escapeHtml(m.text) +
          '<span class="bubble-meta">' + time + '</span></div>';
      }).join('');
      container.scrollTop = container.scrollHeight;
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function updateUI(state) {
      const statusBadge = document.getElementById('statusBadge');
      const approvalCard = document.getElementById('approvalCard');

      statusBadge.className = 'status-badge status-' + state.status;
      statusBadge.textContent = state.status;

      currentApproval = state.pendingApproval;
      if (state.pendingApproval) {
        approvalCard.style.display = 'block';
        document.getElementById('approvalKind').textContent = state.pendingApproval.kind;
        document.getElementById('approvalSummary').textContent = state.pendingApproval.summary;
      } else {
        approvalCard.style.display = 'none';
      }
    }

    async function handleSendPrompt() {
      const input = document.getElementById('promptInput');
      const text = input.value.trim();
      if (!text) return;
      document.getElementById('sendPromptBtn').disabled = true;
      const res = await apiCall('/v1/prompt', 'POST', { text });
      document.getElementById('sendPromptBtn').disabled = false;
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
      await apiCall('/v1/stop', 'POST');
      refreshState();
    }

    function initWebSocket() {
      if (!token) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = proto + '//' + window.location.host + '/v1/stream?token=' + encodeURIComponent(token);
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          refreshState();
          refreshMessages();
        } catch {}
      };

      ws.onclose = () => {
        setTimeout(initWebSocket, 3000);
      };
    }

    if (!token) {
      document.getElementById('authSection').style.display = 'block';
    } else {
      refreshState();
      refreshMessages();
      initWebSocket();
    }
  </script>
</body>
</html>`;
}
