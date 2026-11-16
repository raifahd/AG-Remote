import * as vscode from 'vscode';
import { BridgeServer } from './server.js';
import { findTailscaleIpv4 } from './network.js';
import { TokenManager, SecretStore, FileSecretStore } from './auth.js';
import { SdkAdapter } from './adapters/SdkAdapter.js';
import { AgentStateMachine } from './stateMachine.js';
import { NtfyNotifier } from './notifier.js';
import { RelayStore } from './relay-host/relay-store.js';
import { RelayHost, RelayStatus } from './relay-host/relay-host.js';

class VsCodeSecretStore implements SecretStore {
  private readonly secrets: vscode.SecretStorage;

  constructor(secrets: vscode.SecretStorage) {
    this.secrets = secrets;
  }

  async get(key: string): Promise<string | undefined> {
    return this.secrets.get(key);
  }

  async store(key: string, value: string): Promise<void> {
    await this.secrets.store(key, value);
  }

  async delete(key: string): Promise<void> {
    await this.secrets.delete(key);
  }
}

interface WorkerSession {
  windowId: string;
  port: number;
  timer: NodeJS.Timeout;
}

let serverInstance: BridgeServer | null = null;
let adapterInstance: SdkAdapter | null = null;
let workerInstance: WorkerSession | null = null;
let statusBarItem: vscode.StatusBarItem | null = null;
let tokenManagerInstance: TokenManager | null = null;
let notifierInstance: NtfyNotifier | null = null;
let relayStoreInstance: RelayStore | null = null;
let relayHostInstance: RelayHost | null = null;
let outputChannel: vscode.OutputChannel | null = null;
let currentRelayStatus: RelayStatus = 'stopped';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  outputChannel = vscode.window.createOutputChannel('AG Remote');
  context.subscriptions.push(outputChannel);

  let secretStore: SecretStore;
  let isFallback = false;
  try {
    secretStore = new VsCodeSecretStore(context.secrets);
    await secretStore.get('ag-remote.test');
  } catch {
    secretStore = new FileSecretStore();
    isFallback = true;
    vscode.window.showWarningMessage(
      'AG Remote: SecretStorage is unavailable. Falling back to ~/.ag-remote-token file.'
    );
  }

  tokenManagerInstance = new TokenManager(secretStore, isFallback);
  notifierInstance = new NtfyNotifier(secretStore);
  relayStoreInstance = new RelayStore(secretStore);

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'ag-remote.showQr';
  updateStatusBar('stopped');
  context.subscriptions.push(statusBarItem);

  const startCmd = vscode.commands.registerCommand('ag-remote.start', async () => {
    await startBridge();
  });

  const stopCmd = vscode.commands.registerCommand('ag-remote.stop', async () => {
    await stopBridge();
  });

  const restartCmd = vscode.commands.registerCommand('ag-remote.restartServer', async () => {
    await stopBridge();
    await startBridge();
  });

  const showQrCmd = vscode.commands.registerCommand('ag-remote.showQr', async () => {
    await showPairingView();
  });

  const regenTokenCmd = vscode.commands.registerCommand('ag-remote.regenerateToken', async () => {
    if (!tokenManagerInstance) {
      return;
    }
    const token = await tokenManagerInstance.regenerateToken();
    vscode.window.showInformationMessage('AG Remote: Bearer token regenerated.');
    outputChannel?.appendLine(`Token regenerated. Current active token updated.`);
    if (serverInstance) {
      vscode.window.showInformationMessage('Active clients will need to re-pair with the new token.');
    }
    void token;
  });

  const testPushCmd = vscode.commands.registerCommand('ag-remote.testPush', async () => {
    if (!notifierInstance) {
      return;
    }
    const ok = await notifierInstance.notifyTest();
    if (ok) {
      vscode.window.showInformationMessage('AG Remote: Test notification sent successfully to ntfy.');
    } else {
      vscode.window.showErrorMessage('AG Remote: Failed to send test notification to ntfy.');
    }
  });

  const managePhonesCmd = vscode.commands.registerCommand('ag-remote.managePhones', async () => {
    if (!relayStoreInstance) return;
    await relayStoreInstance.init();
    const phones = relayStoreInstance.getPairedPhones();
    if (phones.length === 0) {
      vscode.window.showInformationMessage('AG Remote: No phones are currently paired via E2E Relay.');
      return;
    }
    const items = phones.map((p) => ({
      label: p.name,
      description: `Added: ${new Date(p.addedAt).toLocaleDateString()} · Last seen: ${new Date(p.lastSeen).toLocaleTimeString()}`,
      pub: p.pub
    }));
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a paired phone to manage'
    });
    if (!picked) return;

    const action = await vscode.window.showWarningMessage(
      `Revoke pairing for "${picked.label}"?`,
      { modal: true },
      'Revoke Device',
      'Cancel'
    );
    if (action === 'Revoke Device') {
      await relayStoreInstance.removePaired(picked.pub);
      vscode.window.showInformationMessage(`AG Remote: Revoked pairing for "${picked.label}".`);
    }
  });

  const revokePairingsCmd = vscode.commands.registerCommand('ag-remote.revokePairings', async () => {
    if (!relayStoreInstance) return;
    const confirm = await vscode.window.showWarningMessage(
      'Revoke ALL paired phones and regenerate E2E room identity?',
      { modal: true },
      'Revoke All',
      'Cancel'
    );
    if (confirm === 'Revoke All') {
      await relayStoreInstance.resetIdentity();
      vscode.window.showInformationMessage('AG Remote: All phone pairings revoked and E2E identity reset.');
      if (relayHostInstance) {
        await stopBridge();
        await startBridge();
      }
    }
  });

  context.subscriptions.push(
    startCmd,
    stopCmd,
    restartCmd,
    showQrCmd,
    regenTokenCmd,
    testPushCmd,
    managePhonesCmd,
    revokePairingsCmd
  );
}

export async function deactivate(): Promise<void> {
  await stopBridge();
}

async function startBridge(): Promise<void> {
  if (serverInstance || workerInstance) {
    vscode.window.showInformationMessage('AG Remote: Bridge is already active in this window.');
    return;
  }

  const port = 48123;
  const tailscaleIp = findTailscaleIpv4();
  const host = tailscaleIp ?? '127.0.0.1';

  if (!tailscaleIp) {
    vscode.window.showWarningMessage(
      'AG Remote: Tailscale IPv4 address not found. Binding to local loopback (127.0.0.1).'
    );
  }

  if (!tokenManagerInstance) {
    vscode.window.showErrorMessage('AG Remote: TokenManager not initialized.');
    return;
  }

  if (notifierInstance && tailscaleIp) {
    notifierInstance.setTailscaleIp(tailscaleIp);
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  const workspaceName = vscode.workspace.name ?? (workspaceFolder ? workspaceFolder.split('/').pop() || 'workspace' : 'workspace');

  const stateMachine = new AgentStateMachine({ debounceMs: 2000 });
  adapterInstance = new SdkAdapter(stateMachine, {
    workspace: workspaceFolder,
    ownerPid: process.pid,
    executeCommand: async (cmd: string, ...args: unknown[]) => Promise.resolve(vscode.commands.executeCommand(cmd, ...args))
  });
  adapterInstance.startPolling();

  serverInstance = new BridgeServer(
    {
      port,
      host,
      version: '0.1.0',
      adapterMode: 'sdk',
      workspacePath: workspaceFolder,
      workspaceName: workspaceName,
      createAdapter: (wsPath, pid) => {
        const sm = new AgentStateMachine({ debounceMs: 2000 });
        const a = new SdkAdapter(sm, {
          workspace: wsPath,
          ownerPid: pid,
          executeCommand: async (cmd: string, ...args: unknown[]) => Promise.resolve(vscode.commands.executeCommand(cmd, ...args))
        });
        a.startPolling();
        return a;
      }
    },
    adapterInstance,
    tokenManagerInstance,
    undefined,
    notifierInstance ?? undefined
  );

  try {
    await serverInstance.start();
    updateStatusBar('hub', host, port, 'connecting');
    vscode.window.showInformationMessage(`AG Remote: Hub listening on http://${host}:${port}`);
    outputChannel?.appendLine(`Bridge Hub started at http://${host}:${port}`);

    if (relayStoreInstance) {
      await relayStoreInstance.init();
      const localToken = await tokenManagerInstance.getOrCreateToken();
      relayHostInstance = new RelayHost({
        relayUrl: 'https://remote.taqnik.in',
        store: relayStoreInstance,
        localApiBase: `http://127.0.0.1:${port}`,
        localToken,
        onStatus: (st) => {
          currentRelayStatus = st;
          updateStatusBar('hub', host, port, st);
        },
        onApprovalNeeded: async (req) => {
          const action = await vscode.window.showInformationMessage(
            `AG Remote: Pair request from "${req.name}" (Check code: ${req.code})`,
            { modal: true },
            'Allow',
            'Deny'
          );
          req.resolve(action === 'Allow');
        }
      });
      serverInstance.setRelayHost(relayHostInstance);
      relayHostInstance.start();
    }
  } catch (err: unknown) {
    adapterInstance.stopPolling();
    adapterInstance = null;
    serverInstance = null;

    const isAddrInUse = Boolean(err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'EADDRINUSE');
    if (isAddrInUse) {
      outputChannel?.appendLine(`Port ${port} in use. Attempting to join as Worker window...`);
      await startWorker(port, workspaceFolder, workspaceName);
      return;
    }

    updateStatusBar('stopped');
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`AG Remote failed to start: ${msg}`);
  }
}

async function startWorker(port: number, workspaceFolder: string, workspaceName: string): Promise<void> {
  const windowId = Buffer.from(workspaceFolder).toString('hex').slice(0, 12) || `worker-${process.pid}`;
  const hubUrl = `http://127.0.0.1:${port}`;

  const register = async (): Promise<boolean> => {
    try {
      const res = await fetch(`${hubUrl}/api/hub/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          windowId,
          workspacePath: workspaceFolder,
          workspaceName,
          pid: process.pid
        })
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const heartbeat = async (): Promise<boolean> => {
    try {
      const res = await fetch(`${hubUrl}/api/hub/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ windowId })
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const registered = await register();
  if (!registered) {
    vscode.window.showWarningMessage(`AG Remote: Port ${port} is occupied, but could not register with Hub at ${hubUrl}.`);
    updateStatusBar('stopped');
    return;
  }

  const timer = setInterval(async () => {
    const ok = await heartbeat();
    if (!ok) {
      const reReg = await register();
      if (!reReg) {
        updateStatusBar('worker-disconnected', '127.0.0.1', port);
      } else {
        updateStatusBar('worker', '127.0.0.1', port);
      }
    }
  }, 4000);

  workerInstance = {
    windowId,
    port,
    timer
  };

  updateStatusBar('worker', '127.0.0.1', port);
  vscode.window.showInformationMessage(`AG Remote: Joined Hub on port ${port} as Worker (${workspaceName})`);
  outputChannel?.appendLine(`Joined AG Remote Hub on port ${port} as Worker (windowId: ${windowId}, workspace: ${workspaceName})`);
}

async function stopBridge(): Promise<void> {
  if (workerInstance) {
    clearInterval(workerInstance.timer);
    workerInstance = null;
    updateStatusBar('stopped');
    vscode.window.showInformationMessage('AG Remote: Worker disconnected.');
    outputChannel?.appendLine('Worker disconnected.');
    return;
  }
  if (relayHostInstance) {
    relayHostInstance.stop();
    relayHostInstance = null;
  }
  if (adapterInstance) {
    adapterInstance.stopPolling();
    adapterInstance = null;
  }
  if (serverInstance) {
    await serverInstance.stop();
    serverInstance = null;
    updateStatusBar('stopped');
    vscode.window.showInformationMessage('AG Remote: Bridge stopped.');
    outputChannel?.appendLine('Bridge stopped.');
  }
}

function updateStatusBar(
  status: 'hub' | 'worker' | 'worker-disconnected' | 'stopped',
  host?: string,
  port?: number,
  relaySt?: RelayStatus
): void {
  if (!statusBarItem) {
    return;
  }
  if (status === 'hub') {
    const relayPart = relaySt === 'online' ? ' · Relay: Online' : (relaySt === 'connecting' ? ' · Relay: Connecting' : '');
    statusBarItem.text = `$(broadcast) AG Remote: Hub (:${port})${relayPart}`;
    statusBarItem.tooltip = `AG Remote Hub is running at http://${host}:${port}. Relay status: ${relaySt ?? 'unknown'}. Click to show pairing details.`;
    statusBarItem.show();
  } else if (status === 'worker') {
    statusBarItem.text = `$(link) AG Remote: Worker (:${port})`;
    statusBarItem.tooltip = `Connected to AG Remote Hub on port ${port} as Worker window.`;
    statusBarItem.show();
  } else if (status === 'worker-disconnected') {
    statusBarItem.text = `$(sync~spin) AG Remote: Reconnecting...`;
    statusBarItem.tooltip = `Reconnecting to AG Remote Hub on port ${port}...`;
    statusBarItem.show();
  } else {
    statusBarItem.text = `$(circle-slash) AG Remote: Stopped`;
    statusBarItem.tooltip = `AG Remote Bridge is stopped. Run 'AG Remote: Start Bridge' to activate.`;
    statusBarItem.show();
  }
}

async function showPairingView(): Promise<void> {
  if (workerInstance) {
    const panel = vscode.window.createWebviewPanel(
      'agRemoteWorker',
      'AG Remote - Worker Window',
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );
    panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AG Remote Worker</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 20px; line-height: 1.5; color: var(--vscode-foreground); }
    .box { background: var(--vscode-editor-background); padding: 16px; border-radius: 8px; border: 1px solid var(--vscode-widget-border); margin: 16px 0; }
  </style>
</head>
<body>
  <h2>AG Remote Worker Window</h2>
  <div class="box">
    <p>This window is registered with the primary <strong>AG Remote Hub</strong> on port <code>${workerInstance.port}</code>.</p>
    <p>Window ID: <code>${workerInstance.windowId}</code></p>
    <p>The Hub window manages network pairing, phone QR codes, and credentials. Switch between windows directly on your mobile device!</p>
  </div>
</body>
</html>`;
    return;
  }

  if (!tokenManagerInstance) {
    return;
  }
  const token = await tokenManagerInstance.getOrCreateToken();
  const ntfyTopic = notifierInstance ? await notifierInstance.getOrCreateTopic() : 'none';
  const tailscaleIp = findTailscaleIpv4();
  const baseUrl = tailscaleIp ? `http://${tailscaleIp}:48123` : 'http://<tailscale-ip>:48123';
  const pairingPayload = JSON.stringify({ baseUrl, token, ntfyTopic });

  let relayUrl = '';
  let shortCode = '';
  let roomId = '';
  if (relayHostInstance && relayStoreInstance) {
    try {
      const p = await relayHostInstance.createPairingUrl();
      relayUrl = p.url;
      shortCode = p.code || '';
      roomId = relayStoreInstance.room;
    } catch {}
  }

  const panel = vscode.window.createWebviewPanel(
    'agRemotePairing',
    'AG Remote Pairing',
    vscode.ViewColumn.Beside,
    { enableScripts: true }
  );

  panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AG Remote Pairing</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 20px; line-height: 1.5; color: var(--vscode-foreground); }
    .box { background: var(--vscode-editor-background); padding: 16px; border-radius: 8px; border: 1px solid var(--vscode-widget-border); margin: 16px 0; }
    code { font-family: monospace; background: var(--vscode-textCodeBlock-background); padding: 2px 6px; border-radius: 4px; word-break: break-all; }
    h2 { margin-top: 0; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  </style>
</head>
<body>
  <h2>AG Remote Pairing</h2>
  <p>Scan or enter these credentials into your AG Remote phone app.</p>

  ${relayUrl ? `
  <div class="box">
    <h3>🌐 Zero-Cloud E2E Encrypted Relay</h3>
    <p>Status: <span class="badge">${currentRelayStatus.toUpperCase()}</span></p>
    <p><strong>Relay Pairing URL:</strong> <code>${relayUrl}</code></p>
    ${shortCode ? `<p><strong>6-Character Short Code:</strong> <code>${shortCode}</code></p>` : ''}
    <p><strong>Room ID:</strong> <code>${roomId}</code></p>
    <p><small>Connects end-to-end with ECDH P-256 and AES-256-GCM. No port forwarding or public IP required.</small></p>
  </div>
  ` : ''}

  <div class="box">
    <h3>🔒 Direct Network Access (Tailscale / LAN)</h3>
    <p><strong>Base URL:</strong> <code>${baseUrl}</code></p>
    <p><strong>Bearer Token:</strong> <code>${token}</code></p>
    <p><strong>ntfy Topic:</strong> <code>${ntfyTopic}</code></p>
    <p><strong>ntfy URL:</strong> <a href="https://ntfy.sh/${ntfyTopic}">https://ntfy.sh/${ntfyTopic}</a></p>
    <p><strong>Direct Pairing JSON:</strong> <code>${pairingPayload}</code></p>
  </div>
  <p>Status: ${serverInstance ? 'Bridge is RUNNING as HUB' : 'Bridge is STOPPED'}</p>
</body>
</html>`;
}
