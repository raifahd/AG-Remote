import {
  generateIdentity,
  exportIdentity,
  importIdentity,
  PhoneE2E
} from '@ag-remote/shared';
import {
  getStoredE2EIdentity,
  saveStoredE2EIdentity,
  getRelayProfile,
  saveRelayProfile
} from './storage.js';

export class RelayLink {
  constructor(options) {
    this.options = {
      relayUrl: 'https://remote.taqnik.in',
      name: 'Android Phone',
      ...options
    };
    this.e2e = null;
    this.ws = null;
    this.identity = null;
    this.pendingRequests = new Map();
    this.status = 'disconnected';
    this.stopped = true;
    this.reconnectTimer = null;
    this.backoff = 1000;
  }

  async initIdentity() {
    if (this.identity) return this.identity;
    const saved = await getStoredE2EIdentity();
    if (saved && saved.pub && saved.jwk) {
      try {
        this.identity = await importIdentity(saved, { extractable: true });
        return this.identity;
      } catch {}
    }
    this.identity = await generateIdentity({ extractable: true });
    const exported = await exportIdentity(this.identity);
    await saveStoredE2EIdentity(exported);
    return this.identity;
  }

  async startPairing(secret) {
    await this.initIdentity();
    this.stopped = false;
    const cleanRelay = this.options.relayUrl.replace(/\/+$/, '');
    const wsProto = cleanRelay.startsWith('https') ? 'wss' : 'ws';
    const cleanHost = cleanRelay.replace(/^https?:\/\//, '');
    const wsUrl = `${wsProto}://${cleanHost}/room/${this.options.room}`;

    return new Promise((resolve, reject) => {
      let resolvedCode = null;

      this.e2e = new PhoneE2E(
        {
          identity: this.identity,
          room: this.options.room,
          name: this.options.name,
          send: (text) => {
            if (this.ws && this.ws.readyState === 1) {
              this.ws.send(text);
            }
          },
          onApp: (obj) => this.handleAppMessage(obj),
          onStatus: (st) => {
            this.setStatus(st);
          },
          onPaired: async (hostPub) => {
            this.options.hostPub = hostPub;
            if (this.options.profileId) {
              await saveRelayProfile(this.options.profileId, {
                relayUrl: this.options.relayUrl,
                room: this.options.room,
                hostPub,
                name: this.options.name
              });
            }
          }
        },
        this.options.hostPub
      );

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = async () => {
        try {
          resolvedCode = await this.e2e.startPairing(secret);
          resolve(resolvedCode);
        } catch (err) {
          reject(err);
        }
      };

      this.ws.onmessage = (event) => {
        const text = typeof event.data === 'string' ? event.data : event.data?.toString();
        if (text) {
          void this.e2e.onMessage(text);
        }
      };

      this.ws.onerror = (err) => {
        if (!resolvedCode) reject(err);
      };

      this.ws.onclose = () => {
        this.setStatus('disconnected');
      };
    });
  }

  async connect() {
    if (!this.stopped && this.ws) return;
    this.stopped = false;
    await this.initIdentity();

    if (!this.options.hostPub && this.options.profileId) {
      const saved = await getRelayProfile(this.options.profileId);
      if (saved && saved.hostPub) {
        this.options.hostPub = saved.hostPub;
        this.options.room = saved.room;
        this.options.relayUrl = saved.relayUrl || this.options.relayUrl;
      }
    }

    if (!this.options.hostPub || !this.options.room) {
      return;
    }

    this.setStatus('connecting');
    const cleanRelay = this.options.relayUrl.replace(/\/+$/, '');
    const wsProto = cleanRelay.startsWith('https') ? 'wss' : 'ws';
    const cleanHost = cleanRelay.replace(/^https?:\/\//, '');
    const wsUrl = `${wsProto}://${cleanHost}/room/${this.options.room}`;

    this.e2e = new PhoneE2E(
      {
        identity: this.identity,
        room: this.options.room,
        name: this.options.name,
        send: (text) => {
          if (this.ws && this.ws.readyState === 1) {
            this.ws.send(text);
          }
        },
        onApp: (obj) => this.handleAppMessage(obj),
        onStatus: (st) => {
          this.setStatus(st);
        }
      },
      this.options.hostPub
    );

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = async () => {
        this.backoff = 1000;
        try {
          await this.e2e.startSession();
        } catch (err) {
          console.warn('Failed to start E2E session:', err);
        }
      };

      this.ws.onmessage = (event) => {
        const text = typeof event.data === 'string' ? event.data : event.data?.toString();
        if (text) {
          void this.e2e.onMessage(text);
        }
      };

      this.ws.onclose = () => {
        this.ws = null;
        this.setStatus('disconnected');
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.setStatus('disconnected');
      };
    } catch {
      this.setStatus('disconnected');
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.backoff);
    this.backoff = Math.min(this.backoff * 1.5, 30_000);
  }

  disconnect() {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  setStatus(st) {
    if (this.status !== st) {
      this.status = st;
      this.options.onStatus?.(st);
    }
  }

  handleAppMessage(obj) {
    if (!obj || typeof obj !== 'object') return;

    if (obj.k === 'res' && obj.id) {
      const pending = this.pendingRequests.get(obj.id);
      if (pending) {
        this.pendingRequests.delete(obj.id);
        if (obj.status >= 200 && obj.status < 300) {
          pending.resolve(obj.body);
        } else {
          const err = new Error(obj.body?.message || `HTTP ${obj.status}`);
          pending.reject(err);
        }
      }
      return;
    }

    if (obj.k === 'evt' && obj.event) {
      this.options.onEvent?.(obj.event);
    }
  }

  async request(pathname, method = 'GET', body = null, timeoutMs = 15000) {
    if (this.status !== 'ready' || !this.e2e) {
      throw new Error('E2E Relay link not ready');
    }

    const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const msg = {
      k: 'req',
      id,
      method,
      path: pathname,
      body: body || undefined
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Relay request timed out'));
        }
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: (data) => {
          clearTimeout(timer);
          resolve(data);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        }
      });

      this.e2e.send(msg).catch((err) => {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(err);
      });
    });
  }
}
