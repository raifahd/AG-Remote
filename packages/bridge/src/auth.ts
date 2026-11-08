import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface SecretStore {
  get(key: string): Promise<string | undefined>;
  store(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export class FileSecretStore implements SecretStore {
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? path.join(os.homedir(), '.ag-remote-token');
  }

  async get(key: string): Promise<string | undefined> {
    try {
      if (!fs.existsSync(this.filePath)) {
        return undefined;
      }
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const data = JSON.parse(raw) as Record<string, string>;
      return data[key];
    } catch {
      return undefined;
    }
  }

  async store(key: string, value: string): Promise<void> {
    let data: Record<string, string> = {};
    try {
      if (fs.existsSync(this.filePath)) {
        data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Record<string, string>;
      }
    } catch {
      data = {};
    }
    data[key] = value;
    fs.writeFileSync(this.filePath, JSON.stringify(data), {
      mode: 0o600,
      encoding: 'utf-8'
    });
  }

  async delete(key: string): Promise<void> {
    try {
      if (!fs.existsSync(this.filePath)) {
        return;
      }
      const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Record<string, string>;
      delete data[key];
      fs.writeFileSync(this.filePath, JSON.stringify(data), {
        mode: 0o600,
        encoding: 'utf-8'
      });
    } catch {
      return;
    }
  }

  getPath(): string {
    return this.filePath;
  }
}

export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function constantTimeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export class RateLimiter {
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly attempts: Map<string, { count: number; resetAt: number }>;

  constructor(maxFailures = 5, windowMs = 60_000) {
    this.maxFailures = maxFailures;
    this.windowMs = windowMs;
    this.attempts = new Map();
  }

  isBlocked(ip: string, now = Date.now()): boolean {
    const entry = this.attempts.get(ip);
    if (!entry) {
      return false;
    }
    if (now > entry.resetAt) {
      this.attempts.delete(ip);
      return false;
    }
    return entry.count >= this.maxFailures;
  }

  recordFailure(ip: string, now = Date.now()): void {
    const entry = this.attempts.get(ip);
    if (!entry || now > entry.resetAt) {
      this.attempts.set(ip, { count: 1, resetAt: now + this.windowMs });
      return;
    }
    entry.count += 1;
  }

  recordSuccess(ip: string): void {
    this.attempts.delete(ip);
  }

  reset(): void {
    this.attempts.clear();
  }
}

export class TokenManager {
  private readonly secretStore: SecretStore;
  private readonly key = 'ag-remote.bearerToken';
  private currentToken: string | null = null;
  private isFallbackStorage = false;

  constructor(secretStore: SecretStore, isFallback = false) {
    this.secretStore = secretStore;
    this.isFallbackStorage = isFallback;
  }

  async getOrCreateToken(): Promise<string> {
    if (this.currentToken) {
      return this.currentToken;
    }
    let token = await this.secretStore.get(this.key);
    if (!token) {
      token = generateSecureToken();
      await this.secretStore.store(this.key, token);
    }
    this.currentToken = token;
    return token;
  }

  async regenerateToken(): Promise<string> {
    const token = generateSecureToken();
    await this.secretStore.store(this.key, token);
    this.currentToken = token;
    return token;
  }

  getToken(): string | null {
    return this.currentToken;
  }

  getIsFallback(): boolean {
    return this.isFallbackStorage;
  }
}

