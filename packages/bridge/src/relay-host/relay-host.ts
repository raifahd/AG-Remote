import { HostE2E, AgentEvent } from '@ag-remote/shared';
import { RelayStore, PhoneRecord } from './relay-store.js';

export type RelayStatus = 'connecting' | 'online' | 'offline' | 'replaced' | 'stopped';

export interface WaitingPhoneRequest {
  id: string;
  name: string;
  code: string;
  resolve: (allow: boolean) => void;
}

export interface RelayHostOptions {
  relayUrl: string;
  store: RelayStore;
  localApiBase: string;
  localToken: string;
  onStatus?: ((status: RelayStatus) => void) | undefined;
  onPaired?: ((phone: PhoneRecord) => void) | undefined;
  onApprovalNeeded?: ((req: WaitingPhoneRequest) => void) | undefined;
  WebSocketImpl?: unknown;
}

const CLOSE_REPLACED = 4001;
const PING_MS = 30_000;
const MAX_BACKOFF_MS = 30_000;
const CONNECT_TIMEOUT_MS = 10_000;

export class RelayHost {
  private readonly opts: RelayHostOptions;
  private e2e!: HostE2E;
  private ws: WebSocket | null = null;
  private status: RelayStatus = 'stopped';
  private stopped = true;
  private backoff = 1000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private connectTimer: NodeJS.Timeout | null = null;
  private readonly pendingApprovals = new Map<string, (allow: boolean) => void>();

  constructor(opts: RelayHostOptions) {
    this.opts = { ...opts, relayUrl: opts.relayUrl.replace(/\/+$/, '') };
    this.initE2E();
  }

  private initE2E(): void {
    this.e2e = new HostE2E({
      identity: this.opts.store.identity,
      room: this.opts.store.room,
      send: (peerId: string, text: string) => {
        if (this.ws && this.ws.readyState === 1) {
          this.ws.send(JSON.stringify({ to: peerId, d: text }));
        }
      },
      onApp: (peerId: string, obj: unknown) => {
        void this.handleAppMessage(peerId, obj);
      },
      isPaired: (phonePub: string) => this.opts.store.isPaired(phonePub),
      savePaired: async (phonePub: string, name: string) => {
        await this.opts.store.savePaired(phonePub, name);
        this.opts.onPaired?.({
          pub: phonePub,
          name,
          addedAt: Date.now(),
          lastSeen: Date.now()
        });
      },
      askOwner: (req: { id: string; name: string; code: string }) => {
        return new Promise<boolean>((resolve) => {
          this.pendingApprovals.set(req.id, resolve);
          const timeout = setTimeout(() => {
            if (this.pendingApprovals.has(req.id)) {
              this.pendingApprovals.delete(req.id);
              resolve(false);
            }
          }, 120_000);

          if (this.opts.onApprovalNeeded) {
            this.opts.onApprovalNeeded({
              id: req.id,
              name: req.name,
              code: req.code,
              resolve: (allow: boolean) => {
                clearTimeout(timeout);
                this.pendingApprovals.delete(req.id);
                resolve(allow);
              }
            });
          } else {
            clearTimeout(timeout);
            this.pendingApprovals.delete(req.id);
            resolve(true);
          }
        });
      },
      onSessionOpen: (_peerId: string, phonePub: string) => {
        void this.opts.store.updateLastSeen(phonePub);
      },
      onSessionClose: (_peerId: string) => {}
    });
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    if (this.ws) {
      try {
        this.ws.close(1000, 'stopping');
      } catch {}
      this.ws = null;
    }
    this.setStatus('stopped');
  }

  getStatus(): RelayStatus {
    return this.status;
  }

  async createPairingUrl(): Promise<{ url: string; code?: string | undefined; secret: string }> {
    const secret = await this.e2e.startPairing();
    const url = `${this.opts.relayUrl}/p/${this.opts.store.room}#${secret}`;
    let code: string | undefined;

    try {
      const res = await fetch(`${this.opts.relayUrl}/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: this.opts.store.room, secret }),
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) {
        const data = await res.json() as { code?: string };
        if (typeof data.code === 'string') {
          code = data.code;
        }
      }
    } catch {}

    return { url, code, secret };
  }

  answerApproval(id: string, allow: boolean): void {
    const resolve = this.pendingApprovals.get(id);
    if (resolve) {
      this.pendingApprovals.delete(id);
      resolve(allow);
    }
  }

  broadcastEvent(event: AgentEvent): void {
    void this.e2e.broadcast({ k: 'evt', event });
  }

  private connect(): void {
    if (this.stopped) return;
    this.clearTimers();
    this.setStatus('connecting');

    const wsProto = this.opts.relayUrl.startsWith('https') ? 'wss' : 'ws';
    const cleanHost = this.opts.relayUrl.replace(/^https?:\/\//, '');
    const wsUrl = `${wsProto}://${cleanHost}/room/${this.opts.store.room}?role=host`;

    const WsClass = (this.opts.WebSocketImpl as typeof WebSocket) || globalThis.WebSocket;
    if (!WsClass) {
      this.setStatus('offline');
      return;
    }

    try {
      const ws = new WsClass(wsUrl);
      this.ws = ws;

      this.connectTimer = setTimeout(() => {
        if (this.status === 'connecting') {
          ws.close();
        }
      }, CONNECT_TIMEOUT_MS);

      ws.onopen = () => {
        this.clearTimers();
        this.backoff = 1000;
        this.setStatus('online');
        this.pingTimer = setInterval(() => {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ ping: Date.now() }));
          }
        }, PING_MS);
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const raw = typeof event.data === 'string' ? event.data : event.data?.toString();
          if (!raw) return;
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          if (typeof parsed.from === 'string' && typeof parsed.d === 'string') {
            void this.e2e.onMessage(parsed.from, parsed.d);
          } else if (parsed.relay === 'peer-left' && typeof parsed.peer === 'string') {
            this.e2e.peerDisconnected(parsed.peer);
          }
        } catch {}
      };

      ws.onclose = (event: CloseEvent) => {
        this.clearTimers();
        this.ws = null;
        if (event.code === CLOSE_REPLACED) {
          this.setStatus('replaced');
          this.stopped = true;
          return;
        }
        if (!this.stopped) {
          this.setStatus('offline');
          this.scheduleReconnect();
        }
      };

      ws.onerror = () => {
        if (!this.stopped && this.status !== 'online') {
          this.setStatus('offline');
        }
      };
    } catch {
      this.setStatus('offline');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.backoff);
    this.backoff = Math.min(this.backoff * 1.5, MAX_BACKOFF_MS);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  private setStatus(status: RelayStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.opts.onStatus?.(status);
    }
  }

  private async handleAppMessage(peerId: string, obj: unknown): Promise<void> {
    if (!obj || typeof obj !== 'object') return;
    const msg = obj as Record<string, unknown>;

    if (msg.k === 'ping') {
      await this.e2e.send(peerId, { k: 'pong', t: msg.t, serverTime: Date.now() });
      return;
    }

    if (msg.k === 'req' && typeof msg.id === 'string' && typeof msg.method === 'string' && typeof msg.path === 'string') {
      const targetUrl = `${this.opts.localApiBase.replace(/\/+$/, '')}${msg.path}`;
      try {
        const fetchOpts: RequestInit = {
          method: msg.method,
          headers: {
            'Authorization': `Bearer ${this.opts.localToken}`,
            'Content-Type': 'application/json'
          }
        };
        if (msg.body !== undefined && msg.method !== 'GET' && msg.method !== 'HEAD') {
          fetchOpts.body = JSON.stringify(msg.body);
        }

        const res = await fetch(targetUrl, fetchOpts);
        const resBody = await res.json().catch(() => ({}));
        await this.e2e.send(peerId, {
          k: 'res',
          id: msg.id,
          status: res.status,
          body: resBody
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'Internal error';
        await this.e2e.send(peerId, {
          k: 'res',
          id: msg.id,
          status: 500,
          body: { error: errorMsg }
        });
      }
    }
  }
}
