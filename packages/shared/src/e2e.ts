// End-to-end encryption between the laptop (host) and phones over relay or WebSocket.
// WebCrypto implementation for Node.js, browsers, and React Native (Hermes).

const subtle = globalThis.crypto.subtle;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const CURVE = { name: 'ECDH', namedCurve: 'P-256' };
const VERSION = 'ag-remote e2e v1';

export const PAIRING_TTL_MS = 5 * 60 * 1000;
export const APPROVAL_TIMEOUT_MS = 2 * 60 * 1000;
export const MAX_PAIRING_FAILURES = 5;
export const MAX_NAME_LENGTH = 64;
export const MAX_FRAME_PLAINTEXT = 40000;
const PART_BYTES = 30000;
const MAX_ASSEMBLED_BYTES = 32 * 1024 * 1024;

export class E2EError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export function toB64u(bytes: Uint8Array | ArrayBuffer): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i++) {
    s += String.fromCharCode(u8[i]!);
  }
  if (typeof btoa === 'function') {
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  return Buffer.from(u8).toString('base64url');
}

export function fromB64u(str: string): Uint8Array {
  if (typeof str !== 'string' || !/^[A-Za-z0-9_-]*$/.test(str)) {
    throw new E2EError('bad-encoding');
  }
  if (typeof atob === 'function') {
    const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
    let bin: string;
    try {
      bin = atob(padded);
    } catch {
      throw new E2EError('bad-encoding');
    }
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  }
  return new Uint8Array(Buffer.from(str, 'base64url'));
}

export function randomBytes(n: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

export function newRoomId(): string {
  return toB64u(randomBytes(16));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((acc, p) => acc + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

async function importPub(b64: string): Promise<CryptoKey> {
  try {
    return await subtle.importKey('raw', fromB64u(b64), CURVE, true, []);
  } catch {
    throw new E2EError('bad-key');
  }
}

async function ecdh(privateKey: CryptoKey, publicKey: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256));
}

function importHmac(secretBytes: Uint8Array): Promise<CryptoKey> {
  return subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function pairTranscript(room: string, phonePub: string, name: string): Uint8Array {
  return encoder.encode([VERSION, 'pair', room, phonePub, name].join('|'));
}

function pairedTranscript(room: string, hostPub: string, phonePub: string): Uint8Array {
  return encoder.encode([VERSION, 'paired', room, hostPub, phonePub].join('|'));
}

export async function checkCode(phonePub: string): Promise<string> {
  const hash = await subtle.digest('SHA-256', encoder.encode([VERSION, 'check', phonePub].join('|')));
  return String(new DataView(hash).getUint32(0) % 10000).padStart(4, '0');
}

function serial(): <T>(fn: () => Promise<T>) => Promise<T> {
  let tail = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn);
    tail = run.then(() => {}, () => {});
    return run;
  };
}

export interface KeyIdentity {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  pub: string;
}

export async function generateIdentity(opts: { extractable?: boolean } = {}): Promise<KeyIdentity> {
  const kp = await subtle.generateKey(CURVE, opts.extractable ?? false, ['deriveBits']);
  return {
    privateKey: kp.privateKey,
    publicKey: kp.publicKey,
    pub: toB64u(await subtle.exportKey('raw', kp.publicKey))
  };
}

export async function exportIdentity(identity: KeyIdentity): Promise<{ pub: string; jwk: JsonWebKey }> {
  return {
    pub: identity.pub,
    jwk: await subtle.exportKey('jwk', identity.privateKey)
  };
}

export async function importIdentity(
  saved: { pub: string; jwk: JsonWebKey },
  opts: { extractable?: boolean } = {}
): Promise<KeyIdentity> {
  const privateKey = await subtle.importKey('jwk', saved.jwk, CURVE, opts.extractable ?? false, ['deriveBits']);
  return {
    privateKey,
    publicKey: await importPub(saved.pub),
    pub: saved.pub
  };
}

export class Channel {
  private readonly sendKey: CryptoKey;
  private readonly recvKey: CryptoKey;
  private sendN = 0;
  private recvN = -1;
  private readonly sendAad: Uint8Array;
  private readonly recvAad: Uint8Array;

  constructor(sendKey: CryptoKey, recvKey: CryptoKey, role: 'phone' | 'host') {
    this.sendKey = sendKey;
    this.recvKey = recvKey;
    this.sendAad = encoder.encode(`${VERSION}|${role === 'phone' ? 'p2h' : 'h2p'}`);
    this.recvAad = encoder.encode(`${VERSION}|${role === 'phone' ? 'h2p' : 'p2h'}`);
  }

  static nonce(n: number): Uint8Array {
    const iv = new Uint8Array(12);
    new DataView(iv.buffer).setBigUint64(4, BigInt(n));
    return iv;
  }

  async seal(obj: unknown): Promise<{ n: number; c: string }> {
    const n = this.sendN++;
    const c = await subtle.encrypt(
      { name: 'AES-GCM', iv: Channel.nonce(n), additionalData: this.sendAad },
      this.sendKey,
      encoder.encode(JSON.stringify(obj))
    );
    return { n, c: toB64u(c) };
  }

  async open(msg: { n: number; c: string }): Promise<unknown> {
    if (!Number.isSafeInteger(msg?.n) || msg.n <= this.recvN || typeof msg.c !== 'string') {
      throw new E2EError('replay');
    }
    let plain: ArrayBuffer;
    try {
      plain = await subtle.decrypt(
        { name: 'AES-GCM', iv: Channel.nonce(msg.n), additionalData: this.recvAad },
        this.recvKey,
        fromB64u(msg.c)
      );
    } catch {
      throw new E2EError('bad-ciphertext');
    }
    this.recvN = msg.n;
    return JSON.parse(decoder.decode(plain));
  }
}

interface DeriveChannelParams {
  role: 'phone' | 'host';
  room: string;
  staticPriv: CryptoKey;
  ephPriv: CryptoKey;
  peerStatic: CryptoKey;
  peerEph: CryptoKey;
  phonePub: string;
  hostPub: string;
  phoneEph: string;
  hostEph: string;
}

async function deriveChannel(p: DeriveChannelParams): Promise<Channel> {
  const ss = await ecdh(p.staticPriv, p.peerStatic);
  const ee = await ecdh(p.ephPriv, p.peerEph);
  const es = p.role === 'phone' ? await ecdh(p.ephPriv, p.peerStatic) : await ecdh(p.staticPriv, p.peerEph);
  const se = p.role === 'phone' ? await ecdh(p.staticPriv, p.peerEph) : await ecdh(p.ephPriv, p.peerStatic);

  const salt = new Uint8Array(
    await subtle.digest('SHA-256', encoder.encode([VERSION, p.room, p.phonePub, p.hostPub, p.phoneEph, p.hostEph].join('|')))
  );

  const base = await subtle.importKey('raw', concat(ss, ee, es, se), 'HKDF', false, ['deriveKey']);
  const key = (info: string) =>
    subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt, info: encoder.encode(`${VERSION}|${info}`) },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

  const p2h = await key('p2h');
  const h2p = await key('h2p');
  return p.role === 'phone' ? new Channel(p2h, h2p, 'phone') : new Channel(h2p, p2h, 'host');
}

export function splitApp(obj: unknown): Array<{ app?: unknown; part?: { mid: string; i: number; n: number; b: string } }> {
  const bytes = encoder.encode(JSON.stringify({ app: obj }));
  if (bytes.length <= MAX_FRAME_PLAINTEXT) {
    return [{ app: obj }];
  }
  const mid = toB64u(randomBytes(8));
  const n = Math.ceil(bytes.length / PART_BYTES);
  return Array.from({ length: n }, (_, i) => ({
    part: { mid, i, n, b: toB64u(bytes.subarray(i * PART_BYTES, (i + 1) * PART_BYTES)) }
  }));
}

export interface SplitPart {
  mid: string;
  i: number;
  n: number;
  b: string;
}

export class Assembler {
  private cur: { mid: string; n: number; chunks: Uint8Array[]; size: number } | null = null;

  add(part: SplitPart): unknown | undefined {
    if (!part || typeof part.mid !== 'string' || !Number.isSafeInteger(part.i) || !Number.isSafeInteger(part.n)) {
      return undefined;
    }
    if (part.i === 0) {
      this.cur = { mid: part.mid, n: part.n, chunks: [], size: 0 };
    }
    const cur = this.cur;
    if (!cur || cur.mid !== part.mid || cur.n !== part.n || cur.chunks.length !== part.i) {
      this.cur = null;
      return undefined;
    }
    const bytes = fromB64u(part.b);
    cur.size += bytes.length;
    if (cur.size > MAX_ASSEMBLED_BYTES) {
      this.cur = null;
      return undefined;
    }
    cur.chunks.push(bytes);
    if (cur.chunks.length === cur.n) {
      this.cur = null;
      const joined = concat(...cur.chunks);
      const wrapped = JSON.parse(decoder.decode(joined)) as { app?: unknown };
      return wrapped?.app;
    }
    return undefined;
  }
}

export interface HostE2EOptions {
  identity: KeyIdentity;
  room: string;
  send: (peerId: string, text: string) => void;
  onApp: (peerId: string, obj: unknown) => void;
  isPaired: (phonePub: string) => boolean;
  savePaired: (phonePub: string, name: string) => Promise<void> | void;
  askOwner: (req: { id: string; name: string; code: string }) => Promise<boolean>;
  onSessionOpen?: (peerId: string, phonePub: string) => void;
  onSessionClose?: (peerId: string) => void;
}

interface HostPeerSession {
  phonePub: string;
  channel: Channel;
  assembler: Assembler;
  queue: <T>(fn: () => Promise<T>) => Promise<T>;
}

interface PendingPairRequest {
  peerId: string;
  phonePub: string;
  phoneKey: CryptoKey;
  name: string;
  code: string;
  secret: Uint8Array;
}

export class HostE2E {
  private readonly opts: HostE2EOptions;
  private readonly sessions = new Map<string, HostPeerSession>();
  private readonly pendingPairs = new Map<string, PendingPairRequest>();
  private pairingSecret: Uint8Array | null = null;
  private pairingTimer: NodeJS.Timeout | null = null;
  private pairingFailures = 0;

  constructor(opts: HostE2EOptions) {
    this.opts = opts;
  }

  async startPairing(): Promise<string> {
    if (this.pairingTimer) {
      clearTimeout(this.pairingTimer);
      this.pairingTimer = null;
    }
    this.pairingSecret = randomBytes(16);
    this.pairingFailures = 0;
    this.pairingTimer = setTimeout(() => {
      this.pairingSecret = null;
      this.pairingTimer = null;
    }, PAIRING_TTL_MS);
    return toB64u(this.pairingSecret);
  }

  stopPairing(): void {
    if (this.pairingTimer) {
      clearTimeout(this.pairingTimer);
      this.pairingTimer = null;
    }
    this.pairingSecret = null;
  }

  async send(peerId: string, appObj: unknown): Promise<void> {
    const session = this.sessions.get(peerId);
    if (!session) throw new E2EError('not-connected');
    const parts = splitApp(appObj);
    await session.queue(async () => {
      for (const p of parts) {
        const sealed = await session.channel.seal(p);
        this.opts.send(peerId, JSON.stringify({ t: 'enc', ...sealed }));
      }
    });
  }

  async broadcast(appObj: unknown): Promise<void> {
    const peers = Array.from(this.sessions.keys());
    await Promise.all(peers.map((p) => this.send(p, appObj).catch(() => {})));
  }

  peerDisconnected(peerId: string): void {
    const session = this.sessions.get(peerId);
    if (session) {
      this.sessions.delete(peerId);
      this.opts.onSessionClose?.(peerId);
    }
    this.pendingPairs.delete(peerId);
  }

  async onMessage(peerId: string, rawText: string): Promise<void> {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      return;
    }

    const t = msg?.t;
    if (t === 'pair') {
      await this.handlePair(peerId, msg);
    } else if (t === 'hello') {
      await this.handleHello(peerId, msg);
    } else if (t === 'enc') {
      await this.handleEnc(peerId, msg);
    }
  }

  private async handlePair(peerId: string, msg: Record<string, unknown>): Promise<void> {
    const phonePub = msg.pub;
    const name = msg.name;
    const mac = msg.mac;
    if (typeof phonePub !== 'string' || typeof name !== 'string' || typeof mac !== 'string') {
      return;
    }
    if (!this.pairingSecret || this.pairingFailures >= MAX_PAIRING_FAILURES) {
      this.opts.send(peerId, JSON.stringify({ t: 'reject', reason: 'expired' }));
      return;
    }

    let phoneKey: CryptoKey;
    try {
      phoneKey = await importPub(phonePub);
    } catch {
      return;
    }

    const hmacKey = await importHmac(this.pairingSecret);
    const valid = await subtle.verify(
      'HMAC',
      hmacKey,
      fromB64u(mac),
      pairTranscript(this.opts.room, phonePub, name)
    );
    if (!valid) {
      this.pairingFailures++;
      this.opts.send(peerId, JSON.stringify({ t: 'reject', reason: 'bad-secret' }));
      return;
    }

    const code = await checkCode(phonePub);
    const secret = this.pairingSecret;
    this.opts.send(peerId, JSON.stringify({ t: 'pair-wait' }));

    const req: PendingPairRequest = {
      peerId,
      phonePub,
      phoneKey,
      name: name.slice(0, MAX_NAME_LENGTH),
      code,
      secret
    };
    this.pendingPairs.set(peerId, req);

    try {
      const allowed = await this.opts.askOwner({ id: peerId, name: req.name, code });
      if (!allowed) {
        this.opts.send(peerId, JSON.stringify({ t: 'reject', reason: 'denied' }));
        this.pendingPairs.delete(peerId);
        return;
      }
    } catch {
      this.opts.send(peerId, JSON.stringify({ t: 'reject', reason: 'timeout' }));
      this.pendingPairs.delete(peerId);
      return;
    }

    if (this.pendingPairs.get(peerId) !== req) return;
    this.pendingPairs.delete(peerId);

    await this.opts.savePaired(phonePub, req.name);

    const pairedHmac = await subtle.sign(
      'HMAC',
      hmacKey,
      pairedTranscript(this.opts.room, this.opts.identity.pub, phonePub)
    );

    this.opts.send(peerId, JSON.stringify({
      t: 'paired',
      pub: this.opts.identity.pub,
      mac: toB64u(pairedHmac)
    }));
  }

  private async handleHello(peerId: string, msg: Record<string, unknown>): Promise<void> {
    const phonePub = msg.pub;
    const phoneEph = msg.eph;
    if (typeof phonePub !== 'string' || typeof phoneEph !== 'string') return;
    if (!this.opts.isPaired(phonePub)) {
      this.opts.send(peerId, JSON.stringify({ t: 'reject', reason: 'not-paired' }));
      return;
    }

    let phoneKey: CryptoKey;
    let phoneEphKey: CryptoKey;
    try {
      phoneKey = await importPub(phonePub);
      phoneEphKey = await importPub(phoneEph);
    } catch {
      return;
    }

    const hostEph = await generateIdentity({ extractable: false });
    const channel = await deriveChannel({
      role: 'host',
      room: this.opts.room,
      staticPriv: this.opts.identity.privateKey,
      ephPriv: hostEph.privateKey,
      peerStatic: phoneKey,
      peerEph: phoneEphKey,
      phonePub,
      hostPub: this.opts.identity.pub,
      phoneEph,
      hostEph: hostEph.pub
    });

    const queue = serial();
    const session: HostPeerSession = {
      phonePub,
      channel,
      assembler: new Assembler(),
      queue
    };
    this.sessions.set(peerId, session);

    const confirm = await channel.seal({ t: 'ready' });
    this.opts.send(peerId, JSON.stringify({
      t: 'welcome',
      eph: hostEph.pub,
      confirm
    }));

    this.opts.onSessionOpen?.(peerId, phonePub);
  }

  private async handleEnc(peerId: string, msg: Record<string, unknown>): Promise<void> {
    const session = this.sessions.get(peerId);
    if (!session) return;
    if (!Number.isSafeInteger(msg.n) || typeof msg.c !== 'string') return;

    let payload: unknown;
    try {
      payload = await session.channel.open({ n: msg.n as number, c: msg.c });
    } catch {
      return;
    }

    if (payload && typeof payload === 'object') {
      const obj = payload as { app?: unknown; part?: SplitPart };
      if (obj.app !== undefined) {
        this.opts.onApp(peerId, obj.app);
      } else if (obj.part) {
        const full = session.assembler.add(obj.part);
        if (full !== undefined) {
          this.opts.onApp(peerId, full);
        }
      }
    }
  }
}

export interface PhoneE2EOptions {
  identity: KeyIdentity;
  room: string;
  name: string;
  send: (text: string) => void;
  onApp: (obj: unknown) => void;
  onStatus?: (status: 'disconnected' | 'pairing' | 'pair-wait' | 'paired' | 'ready' | 'rejected') => void;
  onPaired?: (hostPub: string) => void;
}

export class PhoneE2E {
  private readonly opts: PhoneE2EOptions;
  private channel: Channel | null = null;
  private hostPub: string | null = null;
  private hostKey: CryptoKey | null = null;
  private currentEph: KeyIdentity | null = null;
  private pairingSecretBytes: Uint8Array | null = null;
  private readonly assembler = new Assembler();
  private queue = serial();

  constructor(opts: PhoneE2EOptions, hostPub?: string) {
    this.opts = opts;
    this.hostPub = hostPub ?? null;
  }

  setHostPub(hostPub: string): void {
    this.hostPub = hostPub;
    this.hostKey = null;
  }

  async startPairing(secretB64u: string): Promise<string> {
    this.pairingSecretBytes = fromB64u(secretB64u);
    this.opts.onStatus?.('pairing');
    const hmacKey = await importHmac(this.pairingSecretBytes);
    const mac = await subtle.sign(
      'HMAC',
      hmacKey,
      pairTranscript(this.opts.room, this.opts.identity.pub, this.opts.name)
    );

    this.opts.send(JSON.stringify({
      t: 'pair',
      pub: this.opts.identity.pub,
      name: this.opts.name,
      mac: toB64u(mac)
    }));

    return checkCode(this.opts.identity.pub);
  }

  async startSession(): Promise<void> {
    if (!this.hostPub) throw new E2EError('not-paired');
    this.currentEph = await generateIdentity({ extractable: false });
    this.opts.send(JSON.stringify({
      t: 'hello',
      pub: this.opts.identity.pub,
      eph: this.currentEph.pub
    }));
  }

  async send(appObj: unknown): Promise<void> {
    if (!this.channel) throw new E2EError('not-ready');
    const channel = this.channel;
    const parts = splitApp(appObj);
    await this.queue(async () => {
      for (const p of parts) {
        const sealed = await channel.seal(p);
        this.opts.send(JSON.stringify({ t: 'enc', ...sealed }));
      }
    });
  }

  async onMessage(rawText: string): Promise<void> {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      return;
    }

    const t = msg?.t;
    if (t === 'pair-wait') {
      this.opts.onStatus?.('pair-wait');
    } else if (t === 'paired') {
      await this.handlePaired(msg);
    } else if (t === 'welcome') {
      await this.handleWelcome(msg);
    } else if (t === 'enc') {
      await this.handleEnc(msg);
    } else if (t === 'reject') {
      this.opts.onStatus?.('rejected');
    }
  }

  private async handlePaired(msg: Record<string, unknown>): Promise<void> {
    const hostPub = msg.pub;
    const mac = msg.mac;
    if (typeof hostPub !== 'string' || typeof mac !== 'string' || !this.pairingSecretBytes) return;

    const hmacKey = await importHmac(this.pairingSecretBytes);
    const valid = await subtle.verify(
      'HMAC',
      hmacKey,
      fromB64u(mac),
      pairedTranscript(this.opts.room, hostPub, this.opts.identity.pub)
    );
    if (!valid) throw new E2EError('bad-host-mac');

    this.hostPub = hostPub;
    this.hostKey = await importPub(hostPub);
    this.pairingSecretBytes = null;
    this.opts.onPaired?.(hostPub);
    this.opts.onStatus?.('paired');
    await this.startSession();
  }

  private async handleWelcome(msg: Record<string, unknown>): Promise<void> {
    const hostEphPub = msg.eph;
    const confirm = msg.confirm;
    if (typeof hostEphPub !== 'string' || !confirm || typeof confirm !== 'object' || !this.currentEph || !this.hostPub) {
      return;
    }

    if (!this.hostKey) {
      this.hostKey = await importPub(this.hostPub);
    }
    const hostEphKey = await importPub(hostEphPub);

    this.channel = await deriveChannel({
      role: 'phone',
      room: this.opts.room,
      staticPriv: this.opts.identity.privateKey,
      ephPriv: this.currentEph.privateKey,
      peerStatic: this.hostKey,
      peerEph: hostEphKey,
      phonePub: this.opts.identity.pub,
      hostPub: this.hostPub,
      phoneEph: this.currentEph.pub,
      hostEph: hostEphPub
    });

    const opened = await this.channel.open(confirm as { n: number; c: string });
    if ((opened as { t?: string })?.t !== 'ready') {
      this.channel = null;
      throw new E2EError('bad-handshake');
    }

    this.queue = serial();
    this.opts.onStatus?.('ready');
  }

  private async handleEnc(msg: Record<string, unknown>): Promise<void> {
    if (!this.channel) return;
    if (!Number.isSafeInteger(msg.n) || typeof msg.c !== 'string') return;

    let payload: unknown;
    try {
      payload = await this.channel.open({ n: msg.n as number, c: msg.c });
    } catch {
      return;
    }

    if (payload && typeof payload === 'object') {
      const obj = payload as { app?: unknown; part?: SplitPart };
      if (obj.app !== undefined) {
        this.opts.onApp(obj.app);
      } else if (obj.part) {
        const full = this.assembler.add(obj.part);
        if (full !== undefined) {
          this.opts.onApp(full);
        }
      }
    }
  }
}
