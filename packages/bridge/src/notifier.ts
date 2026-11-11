import https from 'https';
import http from 'http';
import crypto from 'crypto';
import os from 'os';
import { SecretStore } from './auth.js';

export interface NotifierConfig {
  topic?: string;
  serverUrl?: string;
  tailscaleIp?: string | null;
  hostLabel?: string;
  quietHoursEnabled?: boolean;
  quietHoursStart?: number;
  quietHoursEnd?: number;
}

export interface PushOptions {
  title: string;
  message: string;
  priority?: number;
  tags?: string[];
  clickUrl?: string;
}

export class NtfyNotifier {
  private readonly secretStore: SecretStore;
  private readonly serverUrl: string;
  private topic: string | null = null;
  private tailscaleIp: string | null = null;
  private hostLabel: string;
  private quietHoursEnabled = false;
  private quietHoursStart = 23;
  private quietHoursEnd = 7;

  constructor(secretStore: SecretStore, config: NotifierConfig = {}) {
    this.secretStore = secretStore;
    this.serverUrl = (config.serverUrl ?? 'https://ntfy.sh').replace(/\/+$/, '');
    this.tailscaleIp = config.tailscaleIp ?? null;
    this.hostLabel = config.hostLabel ?? os.hostname();
    if (config.topic) {
      this.topic = config.topic;
    }
    if (config.quietHoursEnabled !== undefined) {
      this.quietHoursEnabled = config.quietHoursEnabled;
    }
    if (config.quietHoursStart !== undefined) {
      this.quietHoursStart = config.quietHoursStart;
    }
    if (config.quietHoursEnd !== undefined) {
      this.quietHoursEnd = config.quietHoursEnd;
    }
  }

  async getOrCreateTopic(): Promise<string> {
    if (this.topic) {
      return this.topic;
    }
    const stored = await this.secretStore.get('ag-remote.ntfyTopic');
    if (stored) {
      this.topic = stored;
      return stored;
    }
    const generated = `agremote_${crypto.randomBytes(16).toString('hex')}`;
    await this.secretStore.store('ag-remote.ntfyTopic', generated);
    this.topic = generated;
    return generated;
  }

  async setTopic(topic: string): Promise<void> {
    this.topic = topic;
    await this.secretStore.store('ag-remote.ntfyTopic', topic);
  }

  setTailscaleIp(ip: string | null): void {
    this.tailscaleIp = ip;
  }

  setHostLabel(label: string): void {
    this.hostLabel = label;
  }

  setQuietHours(enabled: boolean, start = 23, end = 7): void {
    this.quietHoursEnabled = enabled;
    this.quietHoursStart = start;
    this.quietHoursEnd = end;
  }

  getQuietHours(): { enabled: boolean; startHour: number; endHour: number } {
    return {
      enabled: this.quietHoursEnabled,
      startHour: this.quietHoursStart,
      endHour: this.quietHoursEnd
    };
  }

  isQuietHours(now = new Date()): boolean {
    if (!this.quietHoursEnabled) {
      return false;
    }
    const hour = now.getHours();
    if (this.quietHoursStart > this.quietHoursEnd) {
      return hour >= this.quietHoursStart || hour < this.quietHoursEnd;
    }
    return hour >= this.quietHoursStart && hour < this.quietHoursEnd;
  }

  async sendNotification(options: PushOptions): Promise<boolean> {
    const topic = await this.getOrCreateTopic();
    const url = new URL(`${this.serverUrl}/${topic}`);

    const clickUrl = options.clickUrl ?? (this.tailscaleIp ? `http://${this.tailscaleIp}:48123/app` : undefined);

    const headers: Record<string, string> = {
      'Content-Type': 'text/plain; charset=utf-8',
      'Title': options.title,
      'Priority': String(options.priority ?? 3)
    };

    if (options.tags && options.tags.length > 0) {
      headers['Tags'] = options.tags.join(',');
    }
    if (clickUrl) {
      headers['Click'] = clickUrl;
    }

    return new Promise((resolve) => {
      const client = url.protocol === 'https:' ? https : http;
      const req = client.request(
        url.toString(),
        {
          method: 'POST',
          headers
        },
        (res) => {
          resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300);
        }
      );

      req.on('error', () => {
        resolve(false);
      });

      req.write(options.message);
      req.end();
    });
  }

  async notifyRunFinished(sessionId: string, sessionTitle?: string): Promise<boolean> {
    if (this.isQuietHours()) {
      return false;
    }
    const shortId = sessionId.length > 12 ? sessionId.slice(0, 12) : sessionId;
    const desc = sessionTitle ? `${sessionTitle} (${shortId})` : `session ${shortId}`;
    return this.sendNotification({
      title: `[${this.hostLabel}] Run Finished`,
      message: `Agent finished execution for ${desc}`,
      priority: 3,
      tags: ['white_check_mark']
    });
  }

  async notifyApprovalRequested(kind: string, summary: string, _sessionId?: string, sessionTitle?: string): Promise<boolean> {
    const safeSummary = summary.length > 120 ? `${summary.slice(0, 117)}...` : summary;
    const titlePrefix = sessionTitle
      ? `[${this.hostLabel}] Approval: ${sessionTitle}`
      : `[${this.hostLabel}] Approval Required (${kind})`;
    return this.sendNotification({
      title: titlePrefix,
      message: safeSummary,
      priority: 4,
      tags: ['warning', 'bell']
    });
  }

  async notifyTest(): Promise<boolean> {
    return this.sendNotification({
      title: `[${this.hostLabel}] AG Remote Test`,
      message: 'Test notification from AG Remote Bridge.',
      priority: 3,
      tags: ['bell']
    });
  }
}
