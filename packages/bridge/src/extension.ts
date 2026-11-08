import * as vscode from 'vscode';
import { BridgeServer } from './server.js';
import { findTailscaleIpv4 } from './network.js';
import { TokenManager, SecretStore, FileSecretStore } from './auth.js';
import { SdkAdapter } from './adapters/SdkAdapter.js';
import { AgentStateMachine } from './stateMachine.js';
import { NtfyNotifier } from './notifier.js';

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

let serverInstance: BridgeServer | null = null;
let adapterInstance: SdkAdapter | null = null;
let statusBarItem: vscode.StatusBarItem | null = null;
let tokenManagerInstance: TokenManager | null = null;
let notifierInstance: NtfyNotifier | null = null;
let outputChannel: vscode.OutputChannel | null = null;

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

  context.subscriptions.push(startCmd, stopCmd, showQrCmd, regenTokenCmd, testPushCmd);
}

export async function deactivate(): Promise<void> {
  await stopBridge();
}

async function startBridge(): Promise<void> {
  if (serverInstance) {
    vscode.window.showInformationMessage('AG Remote: Bridge is already running.');
    return;
  }

  const tailscaleIp = findTailscaleIpv4();
  if (!tailscaleIp) {
    vscode.window.showErrorMessage(
      'AG Remote: Tailscale IPv4 address (100.64.0.0/10) not found. Connect to Tailscale before starting the bridge.'
    );
    return;
  }

  if (!tokenManagerInstance) {
    vscode.window.showErrorMessage('AG Remote: TokenManager not initialized.');
    return;
  }

  if (notifierInstance) {
    notifierInstance.setTailscaleIp(tailscaleIp);
  }

  const stateMachine = new AgentStateMachine({ debounceMs: 2000 });
  adapterInstance = new SdkAdapter(stateMachine, {
    executeCommand: async (cmd: string, ...args: unknown[]) => Promise.resolve(vscode.commands.executeCommand(cmd, ...args))
  });
  adapterInstance.startPolling();

  serverInstance = new BridgeServer(
    {
      port: 48123,
      host: tailscaleIp,
      version: '0.1.0',
      adapterMode: 'sdk'
    },
    adapterInstance,
    tokenManagerInstance,
    undefined,
    notifierInstance ?? undefined
  );

  try {
    await serverInstance.start();
    updateStatusBar('running', tailscaleIp, 48123);
    vscode.window.showInformationMessage(`AG Remote: Bridge listening on http://${tailscaleIp}:48123`);
    outputChannel?.appendLine(`Bridge started at http://${tailscaleIp}:48123`);
  } catch (err) {
    adapterInstance.stopPolling();
    adapterInstance = null;
    serverInstance = null;
    updateStatusBar('stopped');
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`AG Remote failed to start: ${msg}`);
  }
}

async function stopBridge(): Promise<void> {
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

function updateStatusBar(status: 'running' | 'stopped', host?: string, port?: number): void {
  if (!statusBarItem) {
    return;
  }
  if (status === 'running') {
    statusBarItem.text = `$(broadcast) AG Remote: ${host}:${port}`;
    statusBarItem.tooltip = `AG Remote Bridge is running at http://${host}:${port}. Click to show pairing details.`;
    statusBarItem.show();
  } else {
    statusBarItem.text = `$(circle-slash) AG Remote: Stopped`;
    statusBarItem.tooltip = `AG Remote Bridge is stopped. Run 'AG Remote: Start Bridge' to activate.`;
    statusBarItem.show();
  }
}

async function showPairingView(): Promise<void> {
  if (!tokenManagerInstance) {
    return;
  }
  const token = await tokenManagerInstance.getOrCreateToken();
  const ntfyTopic = notifierInstance ? await notifierInstance.getOrCreateTopic() : 'none';
  const tailscaleIp = findTailscaleIpv4();
  const baseUrl = tailscaleIp ? `http://${tailscaleIp}:48123` : 'http://<tailscale-ip>:48123';
  const pairingPayload = JSON.stringify({ baseUrl, token, ntfyTopic });

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
  </style>
</head>
<body>
  <h2>AG Remote Pairing</h2>
  <p>Scan or enter these credentials into your AG Remote phone app.</p>
  <div class="box">
    <p><strong>Base URL:</strong> <code>${baseUrl}</code></p>
    <p><strong>Bearer Token:</strong> <code>${token}</code></p>
    <p><strong>ntfy Topic:</strong> <code>${ntfyTopic}</code></p>
    <p><strong>ntfy URL:</strong> <a href="https://ntfy.sh/${ntfyTopic}">https://ntfy.sh/${ntfyTopic}</a></p>
    <p><strong>Pairing JSON:</strong> <code>${pairingPayload}</code></p>
  </div>
  <p>Status: ${serverInstance ? 'Bridge is RUNNING' : 'Bridge is STOPPED (Start via Command Palette: "AG Remote: Start Bridge")'}</p>
</body>
</html>`;
}

