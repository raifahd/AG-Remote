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

export function isVirtualAdapter(name: string, address: string): boolean {
  const lowerName = name.toLowerCase();
  if (
    lowerName.includes('docker') ||
    lowerName.includes('vethernet') ||
    lowerName.includes('virbr') ||
    lowerName.includes('cni') ||
    lowerName.includes('vmnet') ||
    lowerName.includes('hyper-v') ||
    lowerName.includes('wsl')
  ) {
    return true;
  }

  // Common Docker/Hyper-V host ranges: 172.17.x.x - 172.31.x.x
  if (address.startsWith('172.17.') || address.startsWith('172.18.') || address.startsWith('172.28.') || address.startsWith('172.29.')) {
    return true;
  }

  return false;
}

export function getLocalIpv4Addresses(): string[] {
  const interfaces = os.networkInterfaces();
  const physicalIps: string[] = [];
  const otherIps: string[] = [];

  for (const name of Object.keys(interfaces)) {
    const list = interfaces[name];
    if (!list) continue;
    for (const net of list) {
      if (net.family === 'IPv4' && !net.internal) {
        if (isVirtualAdapter(name, net.address)) {
          otherIps.push(net.address);
        } else if (net.address.startsWith('192.168.') || net.address.startsWith('10.')) {
          physicalIps.unshift(net.address);
        } else {
          physicalIps.push(net.address);
        }
      }
    }
  }

  const result: string[] = [...physicalIps, ...otherIps];
  if (result.length === 0) {
    result.push('127.0.0.1');
  }

  return result;
}

export function getPreferredIpv4(): string {
  return getLocalIpv4Addresses()[0] ?? '127.0.0.1';
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

