import { describe, it, expect } from 'vitest';
import {
  generateIdentity,
  exportIdentity,
  importIdentity,
  Channel,
  splitApp,
  Assembler,
  checkCode,
  HostE2E,
  PhoneE2E,
  E2EError
} from '@ag-remote/shared';
import { RelayStore } from '../src/relay-host/relay-store.js';
import { MemorySecretStore } from '../src/auth.js';

describe('Phase 3 E2E: Key Identity & Serialization', () => {
  it('generates, exports, and re-imports identities faithfully', async () => {
    const id1 = await generateIdentity({ extractable: true });
    expect(id1.pub).toBeDefined();
    expect(id1.pub.length).toBeGreaterThan(20);

    const exported = await exportIdentity(id1);
    expect(exported.pub).toBe(id1.pub);
    expect(exported.jwk.kty).toBe('EC');
    expect(exported.jwk.crv).toBe('P-256');

    const reimported = await importIdentity(exported, { extractable: true });
    expect(reimported.pub).toBe(id1.pub);
  });
});

describe('Phase 3 E2E: Symmetric Channel & AES-256-GCM Framing', () => {
  it('seals and opens payloads securely, rejecting replays and tamper', async () => {
    const key = await globalThis.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    const clientChannel = new Channel(key, key, 'phone');
    const hostChannel = new Channel(key, key, 'host');

    const payload = { action: 'prompt', text: 'Hello secure bridge' };
    const sealed = await clientChannel.seal(payload);

    expect(sealed.n).toBe(0);
    expect(typeof sealed.c).toBe('string');

    const decrypted = await hostChannel.open(sealed);
    expect(decrypted).toEqual(payload);

    await expect(hostChannel.open(sealed)).rejects.toThrow(E2EError);

    const tampered = { n: 1, c: sealed.c.slice(0, -4) + 'AAAA' };
    await expect(hostChannel.open(tampered)).rejects.toThrow(E2EError);
  });
});

describe('Phase 3 E2E: Frame Chunking & Assembler', () => {
  it('keeps small messages intact and splits large payloads', () => {
    const small = { hello: 'world' };
    const smallParts = splitApp(small);
    expect(smallParts).toHaveLength(1);
    expect(smallParts[0]?.app).toEqual(small);

    const bigPayload = { data: 'X'.repeat(75000) };
    const bigParts = splitApp(bigPayload);
    expect(bigParts.length).toBeGreaterThanOrEqual(2);

    const assembler = new Assembler();
    let reassembled: unknown = undefined;

    for (const p of bigParts) {
      if (p.part) {
        const res = assembler.add(p.part);
        if (res !== undefined) {
          reassembled = res;
        }
      }
    }

    expect(reassembled).toEqual(bigPayload);
  });
});

describe('Phase 3 E2E: Full Pairing & Session Handshake', () => {
  it('executes Noise-style handshake, verifies HMAC, and exchanges encrypted messages', async () => {
    const hostId = await generateIdentity({ extractable: true });
    const phoneId = await generateIdentity({ extractable: true });
    const room = 'test-room-123';

    let hostToPhoneMsg: string | null = null;
    let phoneToHostMsg: string | null = null;

    let phoneReceivedApp: unknown = null;
    let hostReceivedApp: unknown = null;

    const pairedStore = new Set<string>();

    const host = new HostE2E({
      identity: hostId,
      room,
      send: (_peerId, text) => {
        hostToPhoneMsg = text;
      },
      onApp: (_peerId, obj) => {
        hostReceivedApp = obj;
      },
      isPaired: (pub) => pairedStore.has(pub),
      savePaired: (pub) => {
        pairedStore.add(pub);
      },
      askOwner: async (_req) => true
    });

    const phone = new PhoneE2E({
      identity: phoneId,
      room,
      name: 'Test Android',
      send: (text) => {
        phoneToHostMsg = text;
      },
      onApp: (obj) => {
        phoneReceivedApp = obj;
      }
    });

    const secret = await host.startPairing();
    const phoneCheckCode = await phone.startPairing(secret);
    const hostCheckCode = await checkCode(phoneId.pub);
    expect(phoneCheckCode).toBe(hostCheckCode);

    expect(phoneToHostMsg).not.toBeNull();
    await host.onMessage('peer-phone-1', phoneToHostMsg!);

    expect(hostToPhoneMsg).not.toBeNull();
    await phone.onMessage(hostToPhoneMsg!);

    expect(pairedStore.has(phoneId.pub)).toBe(true);

    phone.setHostPub(hostId.pub);
    await phone.startSession();

    expect(phoneToHostMsg).not.toBeNull();
    await host.onMessage('peer-phone-1', phoneToHostMsg!);

    expect(hostToPhoneMsg).not.toBeNull();
    await phone.onMessage(hostToPhoneMsg!);

    await phone.send({ k: 'req', id: '1', method: 'GET', path: '/v1/state' });
    expect(phoneToHostMsg).not.toBeNull();
    await host.onMessage('peer-phone-1', phoneToHostMsg!);
    expect(hostReceivedApp).toEqual({ k: 'req', id: '1', method: 'GET', path: '/v1/state' });

    await host.send('peer-phone-1', { k: 'res', id: '1', status: 200, body: { status: 'idle' } });
    expect(hostToPhoneMsg).not.toBeNull();
    await phone.onMessage(hostToPhoneMsg!);
    expect(phoneReceivedApp).toEqual({ k: 'res', id: '1', status: 200, body: { status: 'idle' } });
  });
});

describe('Phase 3 E2E: RelayStore State Management', () => {
  it('persists room, identity, and phone pairings across restarts', async () => {
    const store = new MemorySecretStore();
    const relayStore1 = new RelayStore(store);
    await relayStore1.init();

    const room1 = relayStore1.room;
    const pub1 = relayStore1.identity.pub;
    expect(room1).toBeDefined();

    await relayStore1.savePaired('phone-pub-xyz', 'Pixel 9');
    expect(relayStore1.isPaired('phone-pub-xyz')).toBe(true);

    const relayStore2 = new RelayStore(store);
    await relayStore2.init();

    expect(relayStore2.room).toBe(room1);
    expect(relayStore2.identity.pub).toBe(pub1);
    expect(relayStore2.isPaired('phone-pub-xyz')).toBe(true);
    expect(relayStore2.getPairedPhones()[0]?.name).toBe('Pixel 9');
  });
});

