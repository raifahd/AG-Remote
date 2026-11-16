import { describe, it, expect } from 'vitest';
import request from 'supertest';
import {
  parseServerCommandLine,
  rankLanguageServers,
  normalizeWorkspace,
  LsServer
} from '../src/adapters/lsDiscovery.js';
import { buildInteraction } from '../src/adapters/interactionBuilder.js';
import { isVirtualAdapter, isTailscaleIpv4 } from '../src/network.js';
import { BridgeServer } from '../src/server.js';
import { FakeAdapter } from '../src/adapters/FakeAdapter.js';
import { TokenManager, PairingManager, MemorySecretStore } from '../src/auth.js';

describe('Sentinel: Language Server Process Parsing & Ranking', () => {
  it('parses agy and language_server command lines accurately', () => {
    const agyCmd =
      '/opt/antigravity/bin/agy --hub-port=44045 --csrf_token=tok-123 --parent_pipe_path=/tmp/pipe --add-dir=/home/user/project';
    const parsedAgy = parseServerCommandLine(agyCmd);
    expect(parsedAgy).not.toBeNull();
    expect(parsedAgy?.kind).toBe('agy');
    expect(parsedAgy?.token).toBe('tok-123');
    expect(parsedAgy?.attached).toBe(true);
    expect(parsedAgy?.addDirs).toContain('/home/user/project');

    const lsCmd =
      'C:\\Users\\user\\AppData\\Local\\Programs\\Antigravity\\language_server_windows_x64.exe --hub-port=51234 --csrf_token=tok-456 --workspace_id=ws-abc';
    const parsedLs = parseServerCommandLine(lsCmd);
    expect(parsedLs).not.toBeNull();
    expect(parsedLs?.kind).toBe('language_server');
    expect(parsedLs?.token).toBe('tok-456');
    expect(parsedLs?.workspaceId).toBe('ws-abc');
    expect(parsedLs?.attached).toBe(false);

    expect(parseServerCommandLine('node server.js --port=3000')).toBeNull();
  });

  it('normalizes workspace paths across platforms and schemes', () => {
    expect(normalizeWorkspace('file:///home/user/my-project/')).toBe('/home/user/my-project');
    expect(normalizeWorkspace('file:///C%3A/Users/user/Project')).toBe('c:/users/user/project');
    expect(normalizeWorkspace('C:\\Users\\user\\Project\\')).toBe('c:/users/user/project');
  });

  it('ranks servers prioritizing folder match over parent PID over generic attached', () => {
    const servers: Array<Pick<LsServer, 'ppid' | 'attached' | 'addDirs' | 'kind'> & { id: string }> = [
      { id: 'orphaned', ppid: 1, attached: false, addDirs: [], kind: 'agy' },
      { id: 'attached-generic', ppid: 999, attached: true, addDirs: [], kind: 'agy' },
      { id: 'folder-matched', ppid: 888, attached: true, addDirs: ['/home/user/project'], kind: 'agy' },
      { id: 'own-parent', ppid: 777, attached: false, addDirs: [], kind: 'agy' }
    ];

    const ranked = rankLanguageServers(servers, '/home/user/project', 777);
    expect(ranked[0]?.id).toBe('folder-matched');
    expect(ranked[1]?.id).toBe('own-parent');
    expect(ranked[2]?.id).toBe('attached-generic');
    expect(ranked[3]?.id).toBe('orphaned');
  });
});

describe('Sentinel: Interaction Payload Builder', () => {
  it('constructs correct HandleCascadeUserInteraction payloads for all kinds', () => {
    const permOnce = buildInteraction(
      { trajectoryId: 't1', stepIndex: 0, kind: 'permission' },
      { allow: true, scope: 'once' }
    );
    expect(permOnce).toEqual({
      trajectoryId: 't1',
      stepIndex: 0,
      permission: { allow: true, scope: 1 }
    });

    const permDeny = buildInteraction(
      { trajectoryId: 't1', stepIndex: 0, kind: 'permission' },
      { allow: false, instruction: 'Do not run this' }
    );
    expect(permDeny).toEqual({
      trajectoryId: 't1',
      stepIndex: 0,
      permission: { allow: false, scope: 1, userDenyInstruction: 'Do not run this' }
    });

    const cmd = buildInteraction(
      { trajectoryId: 't1', stepIndex: 1, kind: 'runCommand', commandLine: 'git status' },
      { allow: true, scope: 'once' }
    );
    expect(cmd).toEqual({
      trajectoryId: 't1',
      stepIndex: 1,
      runCommand: { confirm: true, proposedCommandLine: 'git status', submittedCommandLine: 'git status' }
    });

    const file = buildInteraction(
      { trajectoryId: 't1', stepIndex: 2, kind: 'filePermission', absolutePathUri: 'file:///app/main.ts' },
      { allow: true, scope: 'conversation' }
    );
    expect(file).toEqual({
      trajectoryId: 't1',
      stepIndex: 2,
      filePermission: { allow: true, scope: 2, absolutePathUri: 'file:///app/main.ts' }
    });

    const browser = buildInteraction(
      { trajectoryId: 't1', stepIndex: 3, kind: 'openBrowserUrl' },
      { allow: true, scope: 'once' }
    );
    expect(browser).toEqual({
      trajectoryId: 't1',
      stepIndex: 3,
      openBrowserUrl: { confirm: true }
    });

    const question = buildInteraction(
      { trajectoryId: 't1', stepIndex: 4, kind: 'ask_question' },
      { allow: true, scope: 'once', response: 'Option A' }
    );
    expect(question).toEqual({
      trajectoryId: 't1',
      stepIndex: 4,
      askQuestion: { confirm: true, response: 'Option A' }
    });
  });
});

describe('Sentinel: Network Virtual Adapter Filtering', () => {
  it('correctly classifies virtual vs physical interfaces', () => {
    expect(isVirtualAdapter('docker0', '172.17.0.1')).toBe(true);
    expect(isVirtualAdapter('vEthernet (Default Switch)', '172.28.0.1')).toBe(true);
    expect(isVirtualAdapter('virbr0', '192.168.122.1')).toBe(true);
    expect(isVirtualAdapter('wlan0', '172.18.0.1')).toBe(true);

    expect(isVirtualAdapter('wlan0', '192.168.1.100')).toBe(false);
    expect(isVirtualAdapter('eth0', '10.0.0.15')).toBe(false);
  });

  it('detects Tailscale CGNAT range', () => {
    expect(isTailscaleIpv4('100.69.62.84')).toBe(true);
    expect(isTailscaleIpv4('100.127.255.255')).toBe(true);
    expect(isTailscaleIpv4('100.63.255.255')).toBe(false);
    expect(isTailscaleIpv4('192.168.1.1')).toBe(false);
  });
});

describe('Sentinel: Camera QR Pre-fetch Protection', () => {
  it('preserves single-use token on text/html pre-fetch and consumes on JSON exchange', async () => {
    const store = new MemorySecretStore();
    await store.store('ag-remote.bearerToken', 'test-session-secret-token');
    const tokenManager = new TokenManager(store);
    const pairingManager = new PairingManager();
    const server = new BridgeServer(
      {
        port: 49222,
        host: '127.0.0.1',
        version: '3.0.0',
        adapterMode: 'fake'
      },
      new FakeAdapter(),
      tokenManager,
      undefined,
      undefined,
      pairingManager
    );

    const code = pairingManager.generateCode();

    const prefetchRes = await request(server.getApp())
      .get(`/pair?t=${code}`)
      .set('Accept', 'text/html,application/xhtml+xml');

    expect(prefetchRes.status).toBe(302);
    expect(prefetchRes.header.location).toBe(`/app?token=${code}`);
    expect(pairingManager.peekValid(code)).toBe(true);

    const exchangeRes = await request(server.getApp())
      .get(`/pair?t=${code}`)
      .set('Accept', 'application/json');

    expect(exchangeRes.status).toBe(200);
    expect(exchangeRes.body).toEqual({ token: 'test-session-secret-token' });

    expect(pairingManager.peekValid(code)).toBe(false);

    const replayRes = await request(server.getApp())
      .get(`/pair?t=${code}`)
      .set('Accept', 'application/json');

    expect(replayRes.status).toBe(400);
  });
});
