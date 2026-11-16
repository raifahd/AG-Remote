import EventEmitter from 'events';
import type { RegisteredWindow } from '@ag-remote/shared';

export interface WindowRegistryEvents {
  change: (windows: RegisteredWindow[]) => void;
  selected: (window: RegisteredWindow) => void;
  pruned: (windowId: string) => void;
}

export class WindowRegistry extends EventEmitter {
  private readonly windows = new Map<string, RegisteredWindow>();
  private readonly heartbeats = new Map<string, number>();
  private selectedWindowId: string | null = null;
  private pruneTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
  }

  startPruneTimer(intervalMs = 4000, maxAgeMs = 8000): void {
    if (this.pruneTimer) return;
    this.pruneTimer = setInterval(() => {
      this.pruneStale(maxAgeMs);
    }, intervalMs);
  }

  stopPruneTimer(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
  }

  register(window: RegisteredWindow): void {
    const isFirst = this.windows.size === 0;
    this.windows.set(window.windowId, {
      ...window,
      focusedAt: window.focusedAt ?? Date.now()
    });
    this.heartbeats.set(window.windowId, Date.now());

    if (isFirst || !this.selectedWindowId) {
      this.selectedWindowId = window.windowId;
    }

    this.emitChange();
  }

  heartbeat(windowId: string, activeConversationId?: string): boolean {
    const existing = this.windows.get(windowId);
    if (!existing) {
      return false;
    }

    this.heartbeats.set(windowId, Date.now());
    if (activeConversationId && existing.activeConversationId !== activeConversationId) {
      this.windows.set(windowId, {
        ...existing,
        activeConversationId
      });
      this.emitChange();
    }
    return true;
  }

  unregister(windowId: string): boolean {
    const existed = this.windows.delete(windowId);
    this.heartbeats.delete(windowId);

    if (this.selectedWindowId === windowId) {
      const remaining = Array.from(this.windows.keys());
      this.selectedWindowId = remaining[0] ?? null;
    }

    if (existed) {
      this.emitChange();
    }
    return existed;
  }

  select(windowId: string): RegisteredWindow | null {
    const target = this.windows.get(windowId);
    if (!target) {
      return null;
    }
    this.selectedWindowId = windowId;
    this.windows.set(windowId, {
      ...target,
      focusedAt: Date.now()
    });
    this.emit('selected', this.windows.get(windowId)!);
    this.emitChange();
    return this.windows.get(windowId)!;
  }

  getSelected(): RegisteredWindow | null {
    if (!this.selectedWindowId) {
      return null;
    }
    return this.windows.get(this.selectedWindowId) ?? null;
  }

  getSelectedId(): string | null {
    return this.selectedWindowId;
  }

  getAll(): RegisteredWindow[] {
    return Array.from(this.windows.values());
  }

  get(windowId: string): RegisteredWindow | null {
    return this.windows.get(windowId) ?? null;
  }

  pruneStale(maxAgeMs = 8000): string[] {
    const now = Date.now();
    const pruned: string[] = [];

    for (const [windowId, lastBeat] of this.heartbeats.entries()) {
      if (now - lastBeat > maxAgeMs) {
        pruned.push(windowId);
        this.windows.delete(windowId);
        this.heartbeats.delete(windowId);
        if (this.selectedWindowId === windowId) {
          const remaining = Array.from(this.windows.keys());
          this.selectedWindowId = remaining[0] ?? null;
        }
        this.emit('pruned', windowId);
      }
    }

    if (pruned.length > 0) {
      this.emitChange();
    }
    return pruned;
  }

  clear(): void {
    this.windows.clear();
    this.heartbeats.clear();
    this.selectedWindowId = null;
    this.emitChange();
  }

  private emitChange(): void {
    this.emit('change', this.getAll());
  }
}

export const windowRegistry = new WindowRegistry();
