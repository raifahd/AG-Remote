import { AgentEventSchema } from '@ag-remote/shared';

export class BridgeWebSocketClient {
  constructor(profile, onEvent, onStatusChange) {
    this.profile = profile;
    this.onEvent = onEvent;
    this.onStatusChange = onStatusChange;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.closedExplicitly = false;
    this.connect();
  }

  connect() {
    if (this.closedExplicitly || !this.profile || !this.profile.baseUrl || !this.profile.token) {
      return;
    }

    const base = this.profile.baseUrl.replace(/\/+$/, '');
    const wsProto = base.startsWith('https:') ? 'wss:' : 'ws:';
    const host = base.replace(/^https?:\/\//, '');
    const url = `${wsProto}//${host}/v1/stream?token=${encodeURIComponent(this.profile.token)}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        if (this.onStatusChange) {
          this.onStatusChange(true);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          const parsed = AgentEventSchema.safeParse(raw);
          if (parsed.success && this.onEvent) {
            this.onEvent(parsed.data);
          }
        } catch {}
      };

      this.ws.onclose = () => {
        if (this.onStatusChange) {
          this.onStatusChange(false);
        }
        if (!this.closedExplicitly) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        if (this.ws) {
          this.ws.close();
        }
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = Math.min(20000, 1000 * Math.pow(1.5, this.reconnectAttempts));
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  close() {
    this.closedExplicitly = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

