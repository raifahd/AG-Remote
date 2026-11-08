import os from 'os';

export function isTailscaleIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4) {
    return false;
  }
  const [first, second, third, fourth] = parts;
  if (first === undefined || second === undefined || third === undefined || fourth === undefined) {
    return false;
  }
  if (Number.isNaN(first) || Number.isNaN(second) || Number.isNaN(third) || Number.isNaN(fourth)) {
    return false;
  }
  if (first < 0 || first > 255 || second < 0 || second > 255 || third < 0 || third > 255 || fourth < 0 || fourth > 255) {
    return false;
  }
  return first === 100 && second >= 64 && second <= 127;
}

export function findTailscaleIpv4(): string | null {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const list = interfaces[name];
    if (!list) {
      continue;
    }
    for (const net of list) {
      if (net.family === 'IPv4' && !net.internal && isTailscaleIpv4(net.address)) {
        return net.address;
      }
    }
  }
  return null;
}

