import { AgentState, ChatMessage, AgentEvent } from '@ag-remote/shared';

export interface Disposable {
  dispose(): void;
}

export interface AgentAdapter {
  getState(): Promise<AgentState>;
  getMessages(limit: number): Promise<ChatMessage[]>;
  sendPrompt(text: string): Promise<void>;
  approve(): Promise<void>;
  reject(): Promise<void>;
  stop(): Promise<void>;
  onEvent(handler: (e: AgentEvent) => void): Disposable;
}

