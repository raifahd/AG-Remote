import { describe, it, expect } from 'vitest';
import { isTailscaleIpv4, findTailscaleIpv4 } from '../src/network.js';

describe('Network module', () => {
  it('correctly validates Tailscale IPv4 addresses within 100.64.0.0/10', () => {
    expect(isTailscaleIpv4('100.64.0.1')).toBe(true);
    expect(isTailscaleIpv4('100.69.62.84')).toBe(true);
    expect(isTailscaleIpv4('100.127.255.254')).toBe(true);

    expect(isTailscaleIpv4('100.63.255.255')).toBe(false);
    expect(isTailscaleIpv4('100.128.0.1')).toBe(false);
    expect(isTailscaleIpv4('192.168.1.1')).toBe(false);
    expect(isTailscaleIpv4('127.0.0.1')).toBe(false);
    expect(isTailscaleIpv4('invalid')).toBe(false);
  });

  it('locates live Tailscale address if tailscale0 is up on host', () => {
    const ip = findTailscaleIpv4();
    if (ip) {
      expect(isTailscaleIpv4(ip)).toBe(true);
    }
  });
});

