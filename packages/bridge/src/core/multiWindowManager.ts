import EventEmitter from 'events';
import type { AgentEvent } from '@ag-remote/shared';
import { AgentAdapter, Disposable } from '../adapters/AgentAdapter.js';
import { WindowRegistry, windowRegistry } from './window-registry.js';

export interface MultiWindowManagerOptions {
  hostWindowId: string;
  hostAdapter: AgentAdapter;
  createAdapter?: ((workspacePath: string, pid?: number | undefined) => AgentAdapter) | undefined;
  registry?: WindowRegistry | undefined;
}

interface Stoppable {
  stopPolling?: () => void;
}

export class MultiWindowManager extends EventEmitter {
  private readonly hostWindowId: string;
  private readonly hostAdapter: AgentAdapter;
  private readonly createAdapter?: ((workspacePath: string, pid?: number | undefined) => AgentAdapter) | undefined;
  private readonly registry: WindowRegistry;
  private readonly channels = new Map<string, AgentAdapter>();
  private readonly channelSubscriptions = new Map<string, Disposable>();

  constructor(options: MultiWindowManagerOptions) {
    super();
    this.hostWindowId = options.hostWindowId;
    this.hostAdapter = options.hostAdapter;
    this.createAdapter = options.createAdapter;
    this.registry = options.registry ?? windowRegistry;

    this.channels.set(this.hostWindowId, this.hostAdapter);
    this.wireChannel(this.hostWindowId, this.hostAdapter);

    this.registry.on('change', this.onRegistryChange);
  }

  private onRegistryChange = (): void => {
    this.syncChannels();
  };

  private syncChannels(): void {
    if (!this.createAdapter) return;

    const currentWindows = this.registry.getAll();
    const liveIds = new Set(currentWindows.map((w) => w.windowId));

    for (const win of currentWindows) {
      if (!this.channels.has(win.windowId)) {
        try {
          const adapter = this.createAdapter(win.workspacePath, win.pid);
          this.channels.set(win.windowId, adapter);
          this.wireChannel(win.windowId, adapter);
        } catch {}
      }
    }

    for (const id of this.channels.keys()) {
      if (id === this.hostWindowId) continue;
      if (!liveIds.has(id)) {
        const sub = this.channelSubscriptions.get(id);
        if (sub) {
          sub.dispose();
          this.channelSubscriptions.delete(id);
        }
        const adapter = this.channels.get(id);
        if (adapter) {
          (adapter as unknown as Stoppable).stopPolling?.();
        }
        this.channels.delete(id);
      }
    }
  }

  private wireChannel(windowId: string, adapter: AgentAdapter): void {
    const sub = adapter.onEvent((event: AgentEvent) => {
      if (this.channels.get(windowId) !== adapter) return;
      const taggedEvent = {
        ...event,
        windowId
      } as AgentEvent;
      this.emit('event', taggedEvent);
    });
    this.channelSubscriptions.set(windowId, sub);
  }

  getAdapter(windowId?: string): AgentAdapter {
    if (windowId && this.channels.has(windowId)) {
      return this.channels.get(windowId)!;
    }

    const selectedId = this.registry.getSelectedId();
    if (selectedId && this.channels.has(selectedId)) {
      return this.channels.get(selectedId)!;
    }

    return this.hostAdapter;
  }

  getHostWindowId(): string {
    return this.hostWindowId;
  }

  getRegistry(): WindowRegistry {
    return this.registry;
  }

  dispose(): void {
    this.registry.off('change', this.onRegistryChange);
    for (const sub of this.channelSubscriptions.values()) {
      sub.dispose();
    }
    this.channelSubscriptions.clear();

    for (const [id, adapter] of this.channels.entries()) {
      if (id !== this.hostWindowId) {
        (adapter as unknown as Stoppable).stopPolling?.();
      }
    }
    this.channels.clear();
  }
}
