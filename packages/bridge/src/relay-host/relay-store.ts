import {
  KeyIdentity,
  generateIdentity,
  exportIdentity,
  importIdentity,
  newRoomId
} from '@ag-remote/shared';
import { SecretStore } from '../auth.js';

export interface PhoneRecord {
  pub: string;
  name: string;
  addedAt: number;
  lastSeen: number;
  pushSub?: unknown | undefined;
}

interface StoredRelayData {
  room: string;
  identity: { pub: string; jwk: JsonWebKey };
  phones: PhoneRecord[];
}

const STORAGE_KEY = 'ag-remote.relay-data';

export class RelayStore {
  private readonly secretStore: SecretStore;
  private roomVal: string | null = null;
  private identityVal: KeyIdentity | null = null;
  private phones: Map<string, PhoneRecord> = new Map();
  private initialized = false;

  constructor(secretStore: SecretStore) {
    this.secretStore = secretStore;
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    const raw = await this.secretStore.get(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as StoredRelayData;
        if (parsed.room && parsed.identity?.pub && parsed.identity?.jwk) {
          this.roomVal = parsed.room;
          this.identityVal = await importIdentity(parsed.identity, { extractable: true });
          if (Array.isArray(parsed.phones)) {
            for (const p of parsed.phones) {
              if (p?.pub) this.phones.set(p.pub, p);
            }
          }
          this.initialized = true;
          return;
        }
      } catch {}
    }

    this.roomVal = newRoomId();
    this.identityVal = await generateIdentity({ extractable: true });
    this.phones = new Map();
    await this.persist();
    this.initialized = true;
  }

  get room(): string {
    if (!this.roomVal) throw new Error('RelayStore not initialized');
    return this.roomVal;
  }

  get identity(): KeyIdentity {
    if (!this.identityVal) throw new Error('RelayStore not initialized');
    return this.identityVal;
  }

  isPaired(phonePub: string): boolean {
    return this.phones.has(phonePub);
  }

  getPairedPhones(): PhoneRecord[] {
    return Array.from(this.phones.values());
  }

  async savePaired(phonePub: string, name: string): Promise<void> {
    const existing = this.phones.get(phonePub);
    const now = Date.now();
    this.phones.set(phonePub, {
      pub: phonePub,
      name,
      addedAt: existing?.addedAt ?? now,
      lastSeen: now,
      pushSub: existing?.pushSub
    });
    await this.persist();
  }

  async removePaired(phonePub: string): Promise<boolean> {
    const existed = this.phones.delete(phonePub);
    if (existed) {
      await this.persist();
    }
    return existed;
  }

  async updateLastSeen(phonePub: string): Promise<void> {
    const p = this.phones.get(phonePub);
    if (p) {
      p.lastSeen = Date.now();
      await this.persist();
    }
  }

  async savePushSub(phonePub: string, pushSub: unknown): Promise<void> {
    const p = this.phones.get(phonePub);
    if (p) {
      p.pushSub = pushSub;
      await this.persist();
    }
  }

  async resetIdentity(): Promise<{ room: string; identity: KeyIdentity }> {
    this.roomVal = newRoomId();
    this.identityVal = await generateIdentity({ extractable: true });
    this.phones.clear();
    await this.persist();
    return { room: this.roomVal, identity: this.identityVal };
  }

  private async persist(): Promise<void> {
    if (!this.roomVal || !this.identityVal) return;
    const exported = await exportIdentity(this.identityVal);
    const data: StoredRelayData = {
      room: this.roomVal,
      identity: exported,
      phones: Array.from(this.phones.values())
    };
    await this.secretStore.store(STORAGE_KEY, JSON.stringify(data));
  }
}

