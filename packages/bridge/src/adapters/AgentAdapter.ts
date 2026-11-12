import {
  AgentState,
  ChatMessage,
  AgentEvent,
  SessionSummary,
  ModelsResponse
} from '@ag-remote/shared';

export interface Disposable {
  dispose(): void;
}

export interface AgentAdapter {
  getState(): Promise<AgentState>;
  listSessions(): Promise<SessionSummary[]>;
  focusSession(id: string): Promise<void>;
  createSession(text?: string, modelId?: string): Promise<string>;
  getMessages(limit: number, sessionId?: string): Promise<ChatMessage[]>;
  sendPrompt(text: string, sessionId?: string, modelId?: string): Promise<void>;
  getModels(sessionId?: string): Promise<ModelsResponse>;
  setModel(modelId: string, sessionId?: string): Promise<void>;
  approve(requestId?: string): Promise<void>;
  reject(requestId?: string): Promise<void>;
  stop(sessionId?: string): Promise<void>;
  onEvent(handler: (e: AgentEvent) => void): Disposable;
}

