import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  generateSecureToken,
  constantTimeCompare,
  RateLimiter,
  FileSecretStore,
  TokenManager
} from '../src/auth.js';

describe('Auth module', () => {
  const tempTokenFile = path.join(os.tmpdir(), `test-token-${Date.now()}.json`);

  afterEach(() => {
    if (fs.existsSync(tempTokenFile)) {
      fs.unlinkSync(tempTokenFile);
    }
  });

  it('generates a 64-character hex token (32 random bytes)', () => {
    const token = generateSecureToken();
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(token)).toBe(true);
  });

  it('performs constant-time comparison accurately', () => {
    const tokenA = 'a'.repeat(64);
    const tokenB = 'a'.repeat(64);
    const tokenC = 'b'.repeat(64);
    const tokenShort = 'a'.repeat(32);

    expect(constantTimeCompare(tokenA, tokenB)).toBe(true);
    expect(constantTimeCompare(tokenA, tokenC)).toBe(false);
    expect(constantTimeCompare(tokenA, tokenShort)).toBe(false);
  });

  it('rate limits failed attempts and allows reset', () => {
    const limiter = new RateLimiter(3, 10_000);
    const ip = '10.0.0.1';

    expect(limiter.isBlocked(ip)).toBe(false);

    limiter.recordFailure(ip);
    limiter.recordFailure(ip);
    expect(limiter.isBlocked(ip)).toBe(false);

    limiter.recordFailure(ip);
    expect(limiter.isBlocked(ip)).toBe(true);

    limiter.recordSuccess(ip);
    expect(limiter.isBlocked(ip)).toBe(false);
  });

  it('stores and retrieves tokens with FileSecretStore under 0o600 permissions', async () => {
    const store = new FileSecretStore(tempTokenFile);
    expect(await store.get('key1')).toBeUndefined();

    await store.store('key1', 'val1');
    expect(await store.get('key1')).toBe('val1');

    if (os.platform() !== 'win32') {
      const stats = fs.statSync(tempTokenFile);
      expect(stats.mode & 0o777).toBe(0o600);
    }

    await store.delete('key1');
    expect(await store.get('key1')).toBeUndefined();
  });

  it('generates and regenerates token in TokenManager', async () => {
    const store = new FileSecretStore(tempTokenFile);
    const manager = new TokenManager(store);

    const token1 = await manager.getOrCreateToken();
    expect(token1).toHaveLength(64);

    const token2 = await manager.getOrCreateToken();
    expect(token2).toBe(token1);

    const token3 = await manager.regenerateToken();
    expect(token3).not.toBe(token1);
    expect(manager.getToken()).toBe(token3);
  });
});

